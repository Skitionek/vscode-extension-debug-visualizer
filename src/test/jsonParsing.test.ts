import * as assert from 'assert';
import {
    decodeEscapes,
    isLikelyJson,
    parseVariableJson,
    preprocessJsonString,
    serializeForScript
} from '../jsonParsing';

function parseOk(raw: string): unknown {
    const result = parseVariableJson(raw, 'v');
    if (!result.ok) {
        assert.fail(`Expected ${raw} to parse, got: ${result.message}`);
    }
    return result.value;
}

suite('isLikelyJson', () => {
    test('accepts objects and arrays', () => {
        assert.strictEqual(isLikelyJson('{"a":1}').isLikely, true);
        assert.strictEqual(isLikelyJson('  [1, 2]  ').isLikely, true);
    });

    test('rejects empty and non-container values', () => {
        assert.deepStrictEqual(isLikelyJson('   '), { isLikely: false, reason: 'Empty string is not valid JSON' });
        assert.strictEqual(isLikelyJson('42').isLikely, false);
        assert.strictEqual(isLikelyJson('hello').isLikely, false);
    });

    test('rejects unbalanced brackets', () => {
        assert.strictEqual(isLikelyJson('{"a":[1}').isLikely, false);
        assert.strictEqual(isLikelyJson('[[1]').isLikely, false);
    });

    test('ignores brackets and commas inside strings', () => {
        assert.strictEqual(isLikelyJson('{"a":"]}"}').isLikely, true);
        assert.strictEqual(isLikelyJson('{"a":",]"}').isLikely, true);
        assert.strictEqual(isLikelyJson('{"a":"\\"}"}').isLikely, true);
    });
});

suite('decodeEscapes', () => {
    test('decodes common escapes', () => {
        assert.strictEqual(decodeEscapes('a\\nb\\tc\\\\d\\"e\\\'f'), 'a\nb\tc\\d"e\'f');
    });

    test('decodes unicode and hex escapes', () => {
        assert.strictEqual(decodeEscapes('\\u00e9\\x41\\u{1F600}'), '\u00e9A\u{1F600}');
    });
});

suite('preprocessJsonString', () => {
    test('leaves unquoted values untouched apart from trimming', () => {
        assert.strictEqual(preprocessJsonString('  {"a":"x\\ny"}  '), '{"a":"x\\ny"}');
    });

    test('decodes double-quoted string literals', () => {
        assert.strictEqual(preprocessJsonString('"{\\"a\\":1}"'), '{"a":1}');
    });

    test('decodes single-quoted string literals', () => {
        assert.strictEqual(preprocessJsonString("'{\"a\":\\'b\\'}'"), '{"a":\'b\'}');
    });
});

suite('parseVariableJson', () => {
    test('parses raw JSON', () => {
        assert.deepStrictEqual(parseOk('{"a":[1,2,{"b":null}]}'), { a: [1, 2, { b: null }] });
    });

    test('keeps escaped newlines inside raw JSON strings', () => {
        assert.deepStrictEqual(parseOk('{"a":"x\\ny"}'), { a: 'x\ny' });
    });

    test('parses C#/Java style double-quoted values with nested escapes', () => {
        assert.deepStrictEqual(parseOk('"{\\"a\\":\\"x\\\\ny\\"}"'), { a: 'x\ny' });
    });

    test('parses JavaScript/Python style single-quoted values', () => {
        assert.deepStrictEqual(parseOk('\'{\\n  "a": 1,\\n  "b": "it\\\'s"\\n}\''), { a: 1, b: "it's" });
    });

    test('parses single-quoted values with escaped newlines inside strings', () => {
        assert.deepStrictEqual(parseOk('\'{"a":"x\\\\ny"}\''), { a: 'x\ny' });
    });

    test('parses unquoted values that contain escaped whitespace between tokens', () => {
        assert.deepStrictEqual(parseOk('{\\n  "a": 1\\n}'), { a: 1 });
    });

    test('accepts trailing-comma lookalikes inside strings', () => {
        assert.deepStrictEqual(parseOk('{"a":",]"}'), { a: ',]' });
    });

    test('reports values that are not JSON', () => {
        const result = parseVariableJson('42', 'count');
        assert.strictEqual(result.ok, false);
        assert.ok(!result.ok && result.message.startsWith('"count" does not appear to be valid JSON'));
    });

    test('reports parse errors with details', () => {
        const result = parseVariableJson('{"a":1,}', 'obj');
        assert.strictEqual(result.ok, false);
        assert.ok(!result.ok && result.message.includes('\n'));
    });
});

suite('serializeForScript', () => {
    test('round-trips the value', () => {
        const value = { a: '</script><script>alert(1)</script>', b: '\u2028&\u2029', c: [1, true, null] };
        const evaluated = new Function(`return ${serializeForScript(value)};`)();
        assert.deepStrictEqual(evaluated, value);
    });

    test('cannot close the surrounding script tag', () => {
        const serialized = serializeForScript({ a: '</script>' });
        assert.ok(!serialized.includes('</script>'));
        assert.ok(!serialized.includes('<'));
    });
});
