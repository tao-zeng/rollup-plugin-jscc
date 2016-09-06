'use strict'

const plugin = require('../')
const expect = require('expect')
const path   = require('path')
const fs     = require('fs')

process.chdir(__dirname)

function concat (name, subdir) {
  let file = path.join(__dirname, subdir || 'expected', name)

  file = file.replace(/\\/g, '/')
  if (!path.extname(file)) file += '.js'
  return file
}

function normalize (buffer) {
  return buffer.trim()
         .replace(/[ \t]*$/gm, '').replace(/(?:\r\n?|\n)+/g, '\n')
}

function getexpect (file) {
  let buffer = fs.readFileSync(concat(file), 'utf8')
  return normalize(buffer)
}

function generate (file, opts) {
  let inFile = concat(file, 'fixtures')
  let result = plugin(opts).load(inFile)

  return result && result.code && result.code.replace(/[ \t]*$/gm, '')
}

function testFile (file, opts, save) {
  let expected = getexpect(file)
  let result = generate(file, opts)

  if (save) {
    // eslint-disable-next-line no-console
    console.error('------------------\n${ result }------------------\n')
    fs.writeFileSync(concat(file + '_out.js'), result || '')
  }
  result = normalize(result)
  expect(result).toBe(expected)
}

function testStr (file, expected, opts) {
  let result = generate(file, opts)

  result = normalize(result)
  expect(result).toBe(expected)
}

describe('rollup-plugin-jscc', () => {

  it('by default keep some comments', () => {
    testFile('defaults')
  })

  it('predefined variable `__FILE` is the relative path of the current file', () => {
    testFile('file-var', {
      comments: ['some', /^\/[\/*]!/]
    })
  })

  it('allows to define custom variables in the `values` property of options', () => {
    testFile('custom-vars', {
      values: {
        __ZERO: 0,
        __MYBOOL: false,
        __MYSTRING: 'foo',
        __INFINITY: 1 / 0,
        __NAN: parseInt('@', 10),
        __NULL: null,
        __UNDEF: undefined
      }
    })
  })

  it('support conditional comments with the `#if __VAR` syntax', () => {
    testStr('if-cc-directive', 'true', {
      values: { __TRUE: true }
    })
  })
})

describe('Compilation variables', () => {
  it('can be defined within the code with `#set`', () => {
    testStr('var-inline-var', 'true\nfoo')
  })
  it('can be defined within the code with expressions', () => {
    testStr('var-inline-expr', 'true\nfoo')
  })
  it('can be used for simple substitution in the code', () => {
    testStr('var-code-replace', 'true==1\n"foo"')
  })
  it('defaults to `undefined` if no value is given', () => {
    testStr('var-default-value', 'true')
  })
  it('can be changed anywhere in the code', () => {
    testStr('var-changes', 'true\nfalse')
  })
  it('`#unset` removes defined variables', () => {
    testStr('var-unset', 'true', { values: { __FOO: true } })
  })
  it('syntax errors in expressions throws during the evaluation', () => {
    expect(() => { generate('var-eval-error') }).toThrow()
  })
  it('undefined vars are replaced with `undefined` in the evaluation', () => {
    testStr('var-eval-undefined', 'true')
  })
  it('other runtime errors throws (like accesing props of undefined)', () => {
    expect(() => { generate('var-eval-prop-undef') }).toThrow()
  })
})

describe('Conditional compilation', () => {
  it('supports `#else`', () => {
    testStr('cc-else', 'true')
  })
  it('and the `#elif` directive', () => {
    testStr('cc-elif', 'true')
  })
  it('have `#ifset` for testing variable existence (even undefined values)', () => {
    testStr('cc-ifset', 'true')
  })
  it('and `#ifnset` for testing not defined variables', () => {
    testStr('cc-ifnset', 'true')
  })
  it('blocks can be nested', () => {
    testStr('cc-nested', 'true\ntrue\ntrue')
  })
  it('you can throw an exception with custom message through `#error`', () => {
    expect(() => { generate('cc-error') }).toThrow(/boom!/)
  })
  it('unclosed conditional blocks throws an exception', () => {
    expect(() => { generate('cc-unclosed') }).toThrow()
  })
  it('unbalanced blocks throws', () => {
    expect(() => { generate('cc-unbalanced') }).toThrow()
  })
  it('using multiline comments `/**/` allows hide content to linters', () => {
    testFile('cc-hide-content')
  })
})


describe('HTML processing', () => {
  it('can handle variables', () => {
    testFile('html-vars.html', {
      extensions: ['html'],
      values: { __TITLE: 'My App' }
    })
  })
})


describe('SourceMap support', () => {

  let rollup = require('rollup').rollup

  it('test bundle generated by rollup w/inlined sourcemap', () => {
    return rollup({
      entry: concat('bundle-src.js', 'maps'),
      sourceMap: true,
      plugins: [
        plugin({ comments: ['some', 'eslint'] })
      ]
    }).then(function (bundle) {
      let result = bundle.generate({
        format: 'iife',
        indent: true,
        moduleName: 'myapp',
        sourceMap: 'inline',
        sourceMapFile: 'maps/bundle.js', // generates sorce filename w/o path
        banner: '/*\n plugin version 1.0\n*/',
        footer: '/* follow me on Twitter! @amarcruz */'
      })
      let code = result.code + '\n//# source' + 'MappingURL=' + result.map.toUrl()

      /*
        If you modified the source in maps/bundle-src.js, you
        need to write the bundle and test it in the browser again.
      */
      console.log('\t--- writing bundle with inlined sourceMap...')
      fs.writeFileSync(concat('bundle', 'maps'), code, 'utf8')

      let expected = fs.readFileSync(concat('bundle', 'maps'), 'utf8')
      expect(code).toBe(expected, 'Genereted code is incorrect!')
    })
  })
})