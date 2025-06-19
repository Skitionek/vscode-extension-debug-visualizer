import * as vscode from 'vscode';


export type Variable = {
    name: string;
    value: any;
}

export interface VisualizerConstructor {
    new(context: vscode.ExtensionContext, variable: Variable): Visualizer;
}

export interface Visualizer {
    visualize(webview: vscode.Webview): string;
    viewType?: string;
    title?: string;
    canHandle(variable: Variable): boolean;
}