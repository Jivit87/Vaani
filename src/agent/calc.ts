// A small, safe arithmetic evaluator (no eval, no Function): a recursive-descent parser over a fixed
// grammar. The LLM is unreliable at multi-digit arithmetic, so it hands the expression to this instead.
const MAX_LENGTH = 200;

type Fn = (...a: number[]) => number;
const FUNCTIONS: Record<string, { fn: Fn; arity: number }> = {
  sqrt: { fn: Math.sqrt, arity: 1 },
  abs: { fn: Math.abs, arity: 1 },
  round: { fn: Math.round, arity: 1 },
  floor: { fn: Math.floor, arity: 1 },
  ceil: { fn: Math.ceil, arity: 1 },
  ln: { fn: Math.log, arity: 1 },
  log: { fn: Math.log10, arity: 1 },
  sin: { fn: Math.sin, arity: 1 },
  cos: { fn: Math.cos, arity: 1 },
  tan: { fn: Math.tan, arity: 1 },
  pow: { fn: Math.pow, arity: 2 },
  min: { fn: Math.min, arity: 2 },
  max: { fn: Math.max, arity: 2 },
};
const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };

type Token = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string };

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) i++;
    else if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i));
      if (!m) throw new Error('bad number');
      out.push({ t: 'num', v: Number(m[0]) });
      i += m[0].length;
    } else if (/[a-z]/i.test(c)) {
      const m = /^[a-z]+/i.exec(src.slice(i))!;
      out.push({ t: 'id', v: m[0].toLowerCase() });
      i += m[0].length;
    } else if (src.startsWith('**', i)) {
      out.push({ t: 'op', v: '^' });
      i += 2;
    } else if ('+-*/^%(),'.includes(c)) {
      out.push({ t: 'op', v: c });
      i++;
    } else throw new Error(`unexpected character "${c}"`);
  }
  return out;
}

/** Evaluates an arithmetic expression. Throws a short Error for anything invalid. */
export function calculate(expression: string): number {
  if (expression.length > MAX_LENGTH) throw new Error('expression too long');
  const cleaned = expression
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/(?<=\d),(?=\d{3}(?!\d))/g, ''); // 1,000 -> 1000
  const tokens = tokenize(cleaned);
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (v: string) => peek()?.t === 'op' && (peek() as { v: string }).v === v;

  function expr(): number {
    let left = term();
    while (isOp('+') || isOp('-')) {
      const op = (tokens[pos++] as { v: string }).v;
      const right = term();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }
  function term(): number {
    let left = unary();
    while (isOp('*') || isOp('/')) {
      const op = (tokens[pos++] as { v: string }).v;
      const right = unary();
      if (op === '/' && right === 0) throw new Error('division by zero');
      left = op === '*' ? left * right : left / right;
    }
    return left;
  }
  // Unary minus binds looser than ^, so -3^2 is -9, as in normal maths.
  function unary(): number {
    if (isOp('-')) {
      pos++;
      return -unary();
    }
    if (isOp('+')) {
      pos++;
      return unary();
    }
    return power();
  }
  function power(): number {
    const base = postfix();
    if (isOp('^')) {
      pos++;
      return Math.pow(base, unary()); // right associative
    }
    return base;
  }
  function postfix(): number {
    let v = primary();
    while (isOp('%')) {
      pos++;
      v /= 100; // "15%" is 0.15
    }
    return v;
  }
  function primary(): number {
    const tok = tokens[pos++];
    if (!tok) throw new Error('unexpected end');
    if (tok.t === 'num') return tok.v;
    if (tok.t === 'op' && tok.v === '(') {
      const v = expr();
      if (!isOp(')')) throw new Error('missing )');
      pos++;
      return v;
    }
    if (tok.t === 'id') {
      if (tok.v in CONSTANTS) return CONSTANTS[tok.v];
      const f = FUNCTIONS[tok.v];
      if (!f) throw new Error(`unknown name "${tok.v}"`);
      if (!isOp('(')) throw new Error(`${tok.v} needs ( )`);
      pos++;
      const args = [expr()];
      while (isOp(',')) {
        pos++;
        args.push(expr());
      }
      if (!isOp(')')) throw new Error('missing )');
      pos++;
      if (args.length !== f.arity) throw new Error(`${tok.v} takes ${f.arity} argument(s)`);
      return f.fn(...args);
    }
    throw new Error('unexpected symbol');
  }

  const value = expr();
  if (pos !== tokens.length) throw new Error('unexpected trailing input');
  if (!Number.isFinite(value)) throw new Error('result is not a finite number');
  return value;
}

/** Up to 12 significant digits, no floating-point noise (0.1 + 0.2 -> "0.3"). */
export const formatNumber = (n: number): string => String(Number(n.toPrecision(12)));
