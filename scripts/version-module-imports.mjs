function versionedSpecifier(specifier, buildVersion) {
  const version = String(buildVersion || "").trim();
  const normalized = String(specifier || "");

  if (!version || !/^\.\.?\//.test(normalized) || !/\.js(?:[?#]|$)/.test(normalized)) {
    return normalized;
  }

  const hashIndex = normalized.indexOf("#");
  const pathAndQuery = hashIndex >= 0 ? normalized.slice(0, hashIndex) : normalized;
  const hash = hashIndex >= 0 ? normalized.slice(hashIndex) : "";
  const encodedVersion = encodeURIComponent(version);
  const separator = pathAndQuery.includes("?") ? "&build=" : "?v=";

  return `${pathAndQuery}${separator}${encodedVersion}${hash}`;
}

export function versionModuleImports(source, buildVersion) {
  const moduleSpecifier = `(\\.\\.?\\/[^"'\\r\\n]+?\\.js(?:\\?[^"'#\\r\\n]*)?(?:#[^"'\\r\\n]*)?)`;
  const specifierPattern = new RegExp(`(["'])${moduleSpecifier}\\1`, "g");
  const declarationPatterns = [
    /(^[\t ]*import(?!\s*\()[\s\S]*?;)/gm,
    /(^[\t ]*export\s+(?:\*|\{)[\s\S]*?\bfrom\s*["'][^"']+["']\s*;)/gm
  ];
  let result = String(source || "");

  for (const declarationPattern of declarationPatterns) {
    result = result.replace(declarationPattern, (declaration) => (
      declaration.replace(specifierPattern, (match, quote, specifier) => (
        `${quote}${versionedSpecifier(specifier, buildVersion)}${quote}`
      ))
    ));
  }

  return result;
}
