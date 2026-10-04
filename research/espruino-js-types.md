# Espruino JS subset and type definitions for `tsc --checkJs`

Research for [#5](https://github.com/PieterBosNr1/banglejs-custom-app/issues/5) (map: #1). Researched 2026-10-04.

## TL;DR

- **Language:** write ES5 plus the ES6 subset Espruino actually implements: `let`/`const`, arrow functions, template literals, classes (including getters/setters and fields), `for...of` over arrays, object method shorthand, `??`, and `catch {}` with no binding. **Never use:** destructuring, spread/rest, default parameters, optional chaining `?.`, `async`/`await`, generators, `**`, `&&=`/`||=`/`??=`, `import`/`export`, labels, multi-line string literals, `Map`/`Set`/`Symbol`, and calling a function before its declaration (Espruino has no hoisting).
- **Types:** the maintained Bangle.js `.d.ts` files live in [`espruino/BangleApps/typescript/types/`](https://github.com/espruino/BangleApps/tree/master/typescript/types). `main.d.ts` (about 14.5k lines) is generated from the Espruino firmware sources. They are **not on npm**. `@types/espruino` is a different, hand-written package with no `Bangle` in it. **Vendor a pinned copy** into this repo.
- **tsconfig:** `noLib: true` + the vendored types + `checkJs` + `strictNullChecks`/`noImplicitAny`. With `noLib`, *missing runtime APIs* (`Map`, `Math.trunc`, `trimStart`…) become type errors, because only what Espruino implements is declared.
- **Syntax is not caught by tsc.** Even with an old `target`, `tsc --noEmit` accepts destructuring, `?.`, `async`, and so on. Use **ESLint + `eslint-plugin-es-x`**. BangleApps' own ESLint config uses `ecmaVersion: 2022` and does **not** flag unsupported syntax.
- Verified locally with TypeScript 5.9 / 7.0.2 and ESLint 9.39 + eslint-plugin-es-x 9.7 (see [Verification](#verification)).

## 1. Language features on Bangle.js 2 (firmware 2v2x)

Primary source: [espruino.com/Features](https://www.espruino.com/Features) ([source](https://github.com/espruino/EspruinoDocs/blob/master/info/Features.md)), cross-checked against the [Espruino ChangeLog](https://github.com/espruino/Espruino/blob/master/ChangeLog). The latest released firmware is 2v29. Bangle.js 2 is an "Official" board, so features marked `Official` are present.

### Supported (safe to use)

| Feature | Since | Source |
|---|---|---|
| Arrow functions | 1v88 | Features |
| Template literals | 1v88 | Features |
| Classes, `extends`/`super`, static members | 1v96 | Features |
| Class getters/setters, object accessors | 2v00 | Features |
| Class fields (static + instance) | 2v22 | ChangeLog "Add support for static+nonstatic fields in Classes" |
| `let`/`const` with real block scope | 2v14 (earlier: treated like `var`) | Features; ChangeLog 2v14 "Added block scoping for let and const (#971)" |
| Object method shorthand (`{ f() {} }`) | 2v14 | Features ("Enhanced Object Properties (methods)") |
| Nullish coalescing `??` | 2v14 | Features; ChangeLog 2v14 |
| Numeric separators `1_000` | 2v14 | Features |
| Optional catch binding `catch {}` | 2v20 | Features; ChangeLog 2v20 |
| `for...of` (arrays/strings) | yes | ChangeLog 2v18 "...iterating over an object with proto with for...of (fix #2360)"; 2v11 removed it only for "extremely constrained devices (Micro:bit 1 only)" |
| Promises, `Promise.all/race` | 1v86/1v90 | Features (but **no** `.finally`, **no** `allSettled`/`any`) |
| `Object.assign/values/entries/fromEntries`, `[].findIndex/includes`, `"".startsWith/endsWith/includes/repeat/padStart/padEnd`, `Math.sign` | various | Features |
| `String.replaceAll` | 2v22 | ChangeLog 2v22 (Features table is stale and still says `-`) |
| Typed arrays, `JSON`, `Function.prototype.bind` | yes | Features |

### Not supported (must avoid)

| Feature | Notes |
|---|---|
| Destructuring (`const {a} = o`, `[x, y] = arr`) | Features: `-` |
| Spread / rest (`...arr`, `...args`, `{...o}`) | Features: `-` |
| Default parameters | Features: `-`. ChangeLog 2v20: `(a,b=3)=>a+b` "now fails (until default args get added)" |
| Optional chaining `?.` | Features links [PR #2221](https://github.com/espruino/Espruino/pull/2221), which was **closed unmerged** |
| `async`/`await`, generators, iterators protocol, `Symbol` | Features: `-` |
| `**`, `**=`, `&&=`, `||=`, `??=` | Features: `-` |
| `import`/`export` | Features: `-`. Use `require()` / `exports` |
| `Map`, `Set`, `WeakMap`, `WeakSet`, `Proxy`, `Reflect`, `BigInt` | Features: `-` |
| `Math.trunc`, `Number.isNaN/isFinite/EPSILON`, `"".trimStart/trimEnd`, `[].flat/flatMap`, `[].lastIndexOf`, `Promise.prototype.finally`, `Object.freeze/seal` | Features: `-` |
| Labels, `with`, strict mode | Features: `-` |
| Multi-line string literals (backslash-newline) | Features: `-` |
| **Function hoisting** | Features: `-`. "Espruino executes code by parsing as it executes… would require two passes." Declare functions before code that calls them at load time. |
| **ASI differs**: `return\n42;` returns `42` | Features. Never break a line after `return`. |
| RegExp: lookahead/lookbehind assertions, numeric quantifiers `x{3}`, `u`/`y`/`s` flags | Features "Regular Expressions" section |
| Unicode strings | 8-bit strings only (an optional UTF-8 build exists for Bangle.js) |

## 2. Type definitions for Bangle globals

### Where they live

- **[`espruino/BangleApps/typescript/types/*.d.ts`](https://github.com/espruino/BangleApps/tree/master/typescript/types)** is the maintained source. At commit `8d19b0b5` it contains `main.d.ts` (14,461 lines, last changed 2026-10-02), plus `other.d.ts`, `utility.d.ts`, `modules.d.ts`, `bangle_extensions.d.ts`, `layout.d.ts`, `locale.d.ts`, `messages.d.ts`, `sched.d.ts`, `settings.d.ts`, `clock_info.d.ts`, `ClockFace.d.ts`, `exstats.d.ts`, `time_utils.d.ts`, `textinput.d.ts`, `info.d.ts`, `funcs.d.ts`. There is also a `types/package.json` (`"name": "banglejs"`, `"typings": "main.d.ts"`), but it is not published.
- `main.d.ts` is **generated** from JSDoc/JSON comments in the firmware C sources by `scripts/build_types.js` in the Espruino repo ([TYPESCRIPT.md](https://github.com/espruino/Espruino/blob/master/TYPESCRIPT.md)). So it tracks firmware closely. Its comment header says "Type definitions for Espruino latest".
- It declares: `g: Graphics<false>` (including `g.theme`), `class Bangle` (events, `setUI`, `loadWidgets`, `buzz`…), `class E` (`showMenu`, `showPrompt`…), `WIDGETS`, `load`, `setWatch`, timers, and the ES built-ins *as Espruino implements them* (`interface Array<T>`, `String`, `Promise`, `Math`…). It also has typed `require()` overloads for built-ins (`require("Storage")`, `"heatshrink"`, …). `modules.d.ts` adds overloads for BangleApps modules (`"Layout"`, `"locale"`, `"sched"`, `"clock_info"`, `"messages"`, …).
- `messages.d.ts` already types Gadgetbridge music events (`EventMusicState` / `EventMusicInfo` with `t: "musicstate" | "musicinfo"`, `track`, `artist`, `state: "play"|"pause"|"stop"`…). This is directly useful for the music app.
- **Not covered:** the `GB(...)` global that Gadgetbridge calls is not declared anywhere in these types. We must declare it ourselves in a small local `.d.ts`. `Storage.readJSON` returns `unknown`, so cast results with JSDoc (`/** @type {Settings} */ (...)`).

### `@types/espruino` is not the same thing

`npm view @types/espruino` → v1.95.0 from DefinitelyTyped (last published 2026-06-02). Its `index.d.ts` is about 4.1k lines, hand-written, and mentions `Bangle` **0 times**. It is not usable for Bangle.js apps.

### How to consume: copy vs npm vs git

| Option | Verdict |
|---|---|
| npm package | Not available (see above). |
| git submodule of BangleApps | Repo is huge (thousands of apps). A submodule makes Docker/Sandcastle clones slow and drags in everything for ~17 files. Not worth it. |
| **Vendor a pinned copy** | **Recommended.** Copy `typescript/types/*.d.ts` into e.g. `types/espruino/`, record the BangleApps commit SHA in a `types/espruino/SOURCE` file, and add an `npm run update-types` script that re-fetches from `https://raw.githubusercontent.com/espruino/BangleApps/<sha>/typescript/types/<file>`. Works offline in Docker. Updates are explicit and reviewable. |

Keep our own declarations (`GB`, app-specific settings types) in a separate file, e.g. `types/local.d.ts`, so updates never clobber them.

## 3. Recommended `tsconfig.json`

BangleApps' own root [`tsconfig.json`](https://github.com/espruino/BangleApps/blob/master/tsconfig.json) uses `"noLib": true`, `"typeRoots": ["./typescript/types/"]`, and a strict set of flags, with `checkJs`/`noEmit` left as commented-out toggles. It also uses `"target": "es5"` and `"ignoreDeprecations": "5.0"`. **Both break on TypeScript 7** (`TS5108: Option 'target=ES5' has been removed`). Adapted for a JS-only project:

```jsonc
{
  "compilerOptions": {
    "target": "es2015",          // es5 is removed in TS 7; target only affects emit, and we don't emit
    "module": "commonjs",        // matches require()/exports
    "noLib": true,               // ONLY Espruino's built-ins (from main.d.ts) exist -> Map, Math.trunc, trimStart... are errors
    "types": [],
    "allowJs": true,
    "checkJs": true,
    "noEmit": true,
    "strictNullChecks": true,
    "noImplicitAny": true,
    "noImplicitThis": true,
    "noImplicitReturns": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true         // vendored .d.ts are not ours to fix
  },
  "include": ["types/**/*.d.ts", "src/**/*.js"]
}
```

Notes:
- `noLib` is what makes tsc useful as an *API* checker. Do not add `lib: ["es5"]` on top, or TS's richer built-ins will shadow Espruino's real ones.
- On **TypeScript 5.x with `target: es2015`**, `for (const v of arr)` errors ("must have a `[Symbol.iterator]()`") because `noLib` provides no `Symbol`. TS 7.0.2 does not report this. Either pin TS 7, or on TS 5 use `target: es5`.
- Each BangleApps file is a *global script*, not a module. Top-level `const`s from different files share one global scope in tsc. Either wrap each app file in an IIFE / block `{ ... }` (as many BangleApps apps already do for fast-load), or keep separate `tsconfig`s per entry file if names clash.
- `noUnusedLocals` does not flag unused *top-level* declarations in scripts (they're globals). Another reason to wrap in a block.

## 4. Linting unsupported syntax

- **BangleApps' [`.eslintrc.js`](https://github.com/espruino/BangleApps/blob/master/.eslintrc.js)** extends `eslint:recommended`, declares Espruino globals (`g`, `Bangle`, `E`, `WIDGETS`, `BTN1`, …), and sets `parserOptions.ecmaVersion: 2022`. It has a TODO for an `espruino` env ([PR #3237](https://github.com/espruino/BangleApps/pull/3237)). `bin/sanitycheck.js` parses apps with acorn `ecmaVersion: 2022`. **Neither flags syntax Espruino can't run.** Useful only for the globals list.
- **Recommended: [`eslint-plugin-es-x`](https://github.com/eslint-community/eslint-plugin-es-x)** with explicit per-feature rules, plus a few core rules. Its `no-new-in-esXXXX` presets don't fit, because Espruino supports *some* ES2015/2020 features and not others. Verified config (ESLint 9 flat config):

```js
// eslint.config.mjs
import esX from "eslint-plugin-es-x";

export default [
  {
    files: ["src/**/*.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "script" },
    plugins: { "es-x": esX },
    rules: {
      "es-x/no-destructuring": "error",
      "es-x/no-spread-elements": "error",
      "es-x/no-rest-parameters": "error",
      "es-x/no-rest-spread-properties": "error",
      "es-x/no-default-parameters": "error",
      "es-x/no-optional-chaining": "error",
      "es-x/no-async-functions": "error",
      "es-x/no-async-iteration": "error",
      "es-x/no-generators": "error",
      "es-x/no-exponential-operators": "error",
      "es-x/no-logical-assignment-operators": "error",
      "es-x/no-modules": "error",
      "es-x/no-bigint": "error",
      "es-x/no-regexp-lookbehind-assertions": "error",
      "es-x/no-regexp-named-capture-groups": "error",
      "es-x/no-regexp-s-flag": "error",
      "es-x/no-regexp-u-flag": "error",
      "es-x/no-regexp-y-flag": "error",
      "no-labels": "error",
      "no-multi-str": "error",
      "no-unexpected-multiline": "error",
      "no-use-before-define": ["error", { functions: true, classes: true, variables: true }],
      "no-restricted-syntax": ["error",
        { selector: "Literal[regex.pattern=/\\{\\d/]", message: "Espruino RegExp has no numeric quantifiers like x{3}." },
        { selector: "Literal[regex.pattern=/\\(\\?[=!]/]", message: "Espruino RegExp has no lookahead assertions." }
      ],
    },
  },
];
```

APIs (`Map`, `Set`, `Symbol`, `Math.trunc`, `trimStart`, `Promise.finally`) don't need es-x rules, because tsc + `noLib` already rejects them.

## Verification

Done in a scratch dir with the BangleApps types copied in (commit `8d19b0b5`):

- A small app (`g.reset().setColor(g.theme.fg)…drawString(\`${t.title}\`)`, `require("Storage").readJSON`, `Bangle.on("touch", (_b, xy) => …)`, `Bangle.setUI({mode:"custom", back})`, `loadWidgets/drawWidgets`) typechecked cleanly. The only error was the expected one: `readJSON` returns `unknown`, so it needs a JSDoc cast.
- Deliberate mistakes caught by **tsc** (TS 5.9 and 7.0.2): `g.drawStrin` ("Did you mean 'drawString'?"), wrong `setColor` arity, `new Map()`, `Math.trunc`, `"a".trimStart()`, and `xy` possibly `undefined` in a touch handler.
- **Not caught by tsc:** destructuring, spread, `?.`, `async`/`await`, `**`, default params, `??=`.
- All of those, plus `/a{3}/` and call-before-declaration, **caught by the ESLint config above** (9/9 errors).
- `target: "es5"` fails on TS 7.0.2 with `TS5108`. On TS 5.x with `target: es2015`, `for...of` over an array gives a false-positive `Symbol.iterator` error.

## Sources

- https://www.espruino.com/Features ([md source](https://github.com/espruino/EspruinoDocs/blob/master/info/Features.md))
- https://github.com/espruino/Espruino/blob/master/ChangeLog
- https://github.com/espruino/Espruino/blob/master/TYPESCRIPT.md
- https://github.com/espruino/Espruino/pull/2221 (optional chaining, closed unmerged)
- https://github.com/espruino/BangleApps/tree/master/typescript (README, `types/`)
- https://github.com/espruino/BangleApps/blob/master/tsconfig.json
- https://github.com/espruino/BangleApps/blob/master/.eslintrc.js
- https://github.com/espruino/BangleApps/blob/master/bin/sanitycheck.js
- https://www.npmjs.com/package/@types/espruino
- https://github.com/eslint-community/eslint-plugin-es-x
