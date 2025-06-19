import * as vscode from 'vscode';
import { Variable } from './types';
import * as viewers from './viewers';

type Value = string | Blob | undefined;

async function getValueFromVariable(session: vscode.DebugSession, variable: any): Promise<string | undefined> {
    // Handle different ways the variable might be passed
    if (variable && variable.evaluateName) {
        // If we have an evaluate name, use it to get the value
        const response = await session.customRequest('evaluate', {
            expression: variable.evaluateName,
            context: 'hover'
        });
        return response.result;
    }
    if (variable && variable.value) {
        // Direct access to value (simpler case)
        return variable.value;
    }
    if (variable && variable.variable) {
        // Sometimes nested in a variable property
        return await getValueFromVariable(session, variable.variable);
    }
    vscode.window.showErrorMessage('Cannot retrieve variable value.');
    return;
}

function getVariableName(variable: any): string {
    // Extract the variable name for error reporting
    if (variable && variable.name) {
        return variable.name;
    }
    if (variable && variable.variable) {
        return getVariableName(variable.variable);
    }
    return 'Unknown';
}

const magicNumbers: { [key: string]: string } = {
    // PDF
    '%PDF': 'application/pdf',
    // PNG
    '\x89PNG': 'image/png',
    // JPEG
    '\xFF\xD8\xFF': 'image/jpeg',
    // GIF
    'GIF8': 'image/gif',
    // MP3
    'ID3': 'audio/mpeg',
    // WAV
    'RIFF': 'audio/wav',
    // MP4
    '\x00\x00\x00\x18ftyp': 'video/mp4',
    // WebM
    '\x1A\x45\xDF\xA3': 'video/webm',
    // WOFF
    'wOFF': 'font/woff',
    // WOFF2
    'wOF2': 'font/woff2',
};

function magicNumberToMimeType(content: Uint8Array): string {
    // Check for common file types based on magic numbers
    for (const [magic, mimeType] of Object.entries(magicNumbers)) {
        if (content.slice(0, magic.length).toString() === magic) {
            return mimeType;
        }
    }
    return 'application/octet-stream'; // Default for unknown types
}


function processRawValue(raw_value: string): Value {
    // For debugpy, we are getting values as singele quoted string with optional prefix
    const match = /^([^'"])['"](.*)['"]$/g.exec(raw_value);
    const [prefix, value] =  match || ['', raw_value];
    if (prefix === '') {
        // No prefix, just return the text value
        return value;
    }
    if (prefix === 'b') {
        // Likely a bytes string
        // substitute escaped backslashes
        const binary_string = value.replace("\\\\", "\\");
        const uint8_array = Uint8Array.from(binary_string, c => c.charCodeAt(0)); 
        const type = magicNumberToMimeType(uint8_array);

        return new Blob([uint8_array], { type: type });
    }
    throw new Error(`Unsupported value: ${raw_value}`);
}


// Register the command for debug variables
export function registerViewCommand(context: vscode.ExtensionContext): void {
    const viewCommand = vscode.commands.registerCommand('visualize', async (variable: any) => {
        // Get the active debug session
        const session = vscode.debug.activeDebugSession;
        if (!session) {
            vscode.window.showErrorMessage('No active debug session.');
            return;
        }

            const raw_value = await getValueFromVariable(session, variable) ?? '';
            const variableName = getVariableName(variable);
            
            // Process vscode debug variable value representation to acure the value
            const value = processRawValue(raw_value);


          return  createViewer(context, {
            name: variableName,
            value: value
          });
    });

    context.subscriptions.push(viewCommand);
}

// Function to create a WebView panel to display the variable
function createViewer(context: vscode.ExtensionContext, variable: Variable): void {
    const viewerClass = Object.values(viewers).find(
        (Viewer: any) => Viewer.canHandle(variable)
    );

    if (!viewerClass) {
        vscode.window.showErrorMessage(`No viewer available for variable: ${variable.name}`);
        return;
    }

    const viewer = new viewerClass(context, variable);

    // Create and show panel
    const extensionUri = context.extensionUri;
    const panel = vscode.window.createWebviewPanel(
        viewer.viewType ?? 'Viewer',
        viewer.title ?? 'Viewer',
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            localResourceRoots: [extensionUri, vscode.Uri.joinPath(extensionUri, 'node_modules')],
            retainContextWhenHidden: true
        }
    );

    // Set the HTML content
    panel.webview.html = viewer.visualize(panel.webview);
}

