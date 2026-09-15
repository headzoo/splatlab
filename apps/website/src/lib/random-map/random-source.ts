export type RandomSource = {
  next(): number;
  integer(minimum: number, maximum: number): number;
  pick<Value>(values: readonly Value[]): Value;
};

function numericSeed(seed: number | string) {
  if (typeof seed === "number") {
    return (Math.trunc(seed) >>> 0) || 0x9e3779b9;
  }
  let value = 2166136261;
  for (const character of seed) {
    value ^= character.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0 || 0x9e3779b9;
}

export function createSeededRandomSource(seed: number | string): RandomSource {
  let state = numericSeed(seed);
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
  return {
    next,
    integer(minimum, maximum) {
      if (!Number.isInteger(minimum) || !Number.isInteger(maximum) || maximum < minimum) {
        throw new RangeError(`Invalid integer range ${minimum}..${maximum}.`);
      }
      return minimum + Math.floor(next() * (maximum - minimum + 1));
    },
    pick(values) {
      if (values.length === 0) throw new RangeError("Cannot pick from an empty collection.");
      return values[Math.min(values.length - 1, Math.floor(next() * values.length))];
    },
  };
}

export function shuffled<Value>(
  values: readonly Value[],
  random: RandomSource,
): Value[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = random.integer(0, index);
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}
