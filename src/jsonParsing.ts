// Pure helpers for turning a debugger variable value into JSON.
// This module must not import 'vscode' so it can be unit tested in plain Node.

export type ParseResult =
    | { ok: true, value: unknown }
    | { ok: false, message: string };

/**
 * Checks if a string is likely to be JSON before attempting to parse it
 * @param str The string to check
 * @returns An object containing whether the string is likely JSON and a reason if not
 */
export function isLikelyJson(str: string): { isLikely: boolean, reason?: string } {
    // Trim the string to remove whitespace
    str = str.trim();

    // Empty string is not JSON
    if (!str) {
        return { isLikely: false, reason: 'Empty string is not valid JSON' };
    }

    // Check if the string starts with either { or [ which are valid JSON starters
    if (!(str.startsWith('{') || str.startsWith('['))) {
        return { isLikely: false, reason: 'JSON must start with { or [' };
    }

    // Check if the string ends with matching closing bracket/brace
    if ((str.startsWith('{') && !str.endsWith('}')) ||
        (str.startsWith('[') && !str.endsWith(']'))) {
        return { isLikely: false, reason: 'Missing closing bracket/brace' };
    }

    // Basic check for balanced brackets/braces
    const stack: string[] = [];
    const openingBrackets = ['{', '['];
    const closingBrackets = ['}', ']'];
    const pairs: {[key: string]: string} = {'}': '{', ']': '['};

    let inString = false;
    let escapeNext = false;

    for (let i = 0; i < str.length; i++) {
        const char = str[i];

        // Handle string literals and escaping
        if (char === '"' && !escapeNext) {
            inString = !inString;
        } else if (char === '\\' && inString && !escapeNext) {
            escapeNext = true;
            continue;
        }

        escapeNext = false;

        // Skip characters within string literals
        if (inString) {
            continue;
        }

        // Check for opening brackets
        if (openingBrackets.includes(char)) {
            stack.push(char);
        }
        // Check for closing brackets
        else if (closingBrackets.includes(char)) {
            if (stack.length === 0 || stack.pop() !== pairs[char]) {
                return { isLikely: false, reason: 'Unbalanced brackets/braces' };
            }
        }
    }

    // If we finish with unbalanced brackets, it's not valid JSON
    if (stack.length > 0) {
        return { isLikely: false, reason: 'Unbalanced brackets/braces' };
    }

    return { isLikely: true };
}

/**
 * Decodes backslash escape sequences as debuggers print them in string literals
 * (JavaScript, Python, C#, Java, ...). Unknown escapes decode to the escaped character.
 * @param str The body of a string literal, without the surrounding quotes
 * @returns The decoded string value
 */
export function decodeEscapes(str: string): string {
    const simple: {[key: string]: string} = {
        'b': '\b', 'f': '\f', 'n': '\n', 'r': '\r', 't': '\t', 'v': '\v', '0': '\0'
    };
    return str.replace(/\\(u\{([0-9a-fA-F]+)\}|u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2})|[\s\S])/g,
        (match, esc: string, codePoint?: string, u4?: string, x2?: string) => {
            const hex = codePoint ?? u4 ?? x2;
            if (hex !== undefined) {
                const code = parseInt(hex, 16);
                return code <= 0x10FFFF ? String.fromCodePoint(code) : match;
            }
            return simple[esc] ?? esc;
        });
}

/**
 * Attempts to preprocess a string to make it JSON-parseable
 * @param jsonValue The string to preprocess
 * @returns The preprocessed string
 */
export function preprocessJsonString(jsonValue: string): string {
    jsonValue = jsonValue.trim();

    // A double-quoted value is often already a valid JSON string literal (e.g. C#, Java, Go)
    if (jsonValue.length >= 2 && jsonValue.startsWith('"') && jsonValue.endsWith('"')) {
        try {
            const decoded = JSON.parse(jsonValue);
            if (typeof decoded === 'string') {
                return decoded.trim();
            }
        } catch {
            // Fall through to the generic escape decoding below
        }
    }

    // If the value is enclosed in quotes (string representation), remove them and decode escapes
    if (jsonValue.length >= 2 &&
        ((jsonValue.startsWith('"') && jsonValue.endsWith('"')) ||
         (jsonValue.startsWith("'") && jsonValue.endsWith("'")))) {
        return decodeEscapes(jsonValue.slice(1, -1)).trim();
    }

    return jsonValue;
}

/**
 * Gets a more detailed error message for JSON parsing errors
 * @param error The error from JSON.parse
 * @param jsonValue The original string that failed to parse
 * @param variableName The name of the variable for context
 * @returns A detailed error message with suggestions
 */
export function getDetailedJsonErrorMessage(error: Error, jsonValue: string, variableName: string): string {
    let errorMessage = `"${variableName}" does not appear to be valid JSON`;

    // Extract position from SyntaxError message if available
    const positionMatch = error.message.match(/position (\d+)/);
    let position = -1;

    if (positionMatch && positionMatch[1]) {
        position = parseInt(positionMatch[1], 10);
    }

    // If we have a position, try to provide more context
    if (position >= 0) {
        // Get a snippet of the JSON around the error
        const start = Math.max(0, position - 10);
        const end = Math.min(jsonValue.length, position + 10);
        const snippet = jsonValue.substring(start, end);

        errorMessage += `\n\nError near: ...${snippet}...`;

        // Add a pointer to the exact position
        const pointerPadding = '...'.length + (position - start);
        errorMessage += `\n${' '.repeat(pointerPadding)}^`;
    }

    // Add the original error message
    errorMessage += `\n\n${error.message}`;

    // Add tips for common JSON errors
    if (error.message.includes('Unexpected end')) {
        errorMessage += "\n\nCheck for missing closing brackets/braces or incomplete string literals.";
    } else if (error.message.includes('Unexpected') || error.message.includes('Expected')) {
        errorMessage += "\n\nCommon issues: Missing commas between elements, extra commas at end of lists/objects, or unquoted property names.";
    }

    return errorMessage;
}

/**
 * Converts a raw debugger variable value into a parsed JSON value
 * @param rawValue The value as reported by the debug adapter
 * @param variableName The name of the variable for error messages
 * @returns The parsed value, or a user-facing error message
 */
export function parseVariableJson(rawValue: string, variableName: string): ParseResult {
    // Preprocess the JSON string to improve parsing chances
    const processedValue = preprocessJsonString(rawValue);

    // Check if the value is likely JSON before attempting to parse
    const likelyJson = isLikelyJson(processedValue);
    if (!likelyJson.isLikely) {
        return { ok: false, message: `"${variableName}" does not appear to be valid JSON: ${likelyJson.reason}` };
    }

    try {
        return { ok: true, value: JSON.parse(processedValue) };
    } catch (error) {
        // Some adapters print escaped text without surrounding quotes; retry with escapes decoded
        if (processedValue.includes('\\')) {
            try {
                return { ok: true, value: JSON.parse(decodeEscapes(processedValue)) };
            } catch {
                // Report the original error below
            }
        }
        if (error instanceof Error) {
            return { ok: false, message: getDetailedJsonErrorMessage(error, processedValue, variableName) };
        }
        return { ok: false, message: `"${variableName}" does not appear to be valid JSON` };
    }
}

/**
 * Serializes a value so it can be embedded safely inside an inline <script> block
 * @param value The value to serialize
 * @returns A JavaScript expression that evaluates to the value
 */
export function serializeForScript(value: unknown): string {
    // Escape characters that could close the script tag or break the JS parser
    return JSON.stringify(value, null, 2)
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}
