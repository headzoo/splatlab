export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return {
      shortCircuit: true,
      url: "data:text/javascript,export {}",
      format: "module",
    };
  }
  return nextResolve(specifier, context);
}
