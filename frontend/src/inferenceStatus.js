export function getInferenceBadge(meta) {
  if (!meta) return null;

  const routeMismatch =
    meta.requestedPath &&
    meta.actualPath &&
    meta.requestedPath !== meta.actualPath
      ? ` Requested ${meta.requestedPath}; actual ${meta.actualPath}.`
      : "";

  if (meta.path === "device") {
    return {
      label: "Checked on your device",
      detail:
        meta.reason || "The final analysis ran on this device.",
      tone: "device",
    };
  }

  if (meta.path === "cloud") {
    return {
      label: "Sent to cloud",
      detail: `${meta.reason || "Cloud inference was used."}${routeMismatch}`,
      tone: "cloud",
    };
  }

  return {
    label: "Rules only (AI unavailable)",
    detail: `${meta.reason || "Showing the rule-based result."}${routeMismatch}`,
    tone: "rules",
  };
}

export function getHybridStatusMessage(status) {
  switch (status?.state) {
    case "rules":
      return "Running deterministic rules...";
    case "rule-engine":
      if (status.ruleState === "loading") {
        return "Loading the offline rule engine (first use)...";
      }
      if (status.ruleState === "analyzing") {
        return "Running deterministic rules...";
      }
      return null;
    case "device-availability":
      return "Checking on-device inference...";
    case "device-initialize":
      return "Preparing the on-device model...";
    case "device-download": {
      const percent = Math.max(
        0,
        Math.min(100, Math.round(Number(status.progress ?? 0) * 100)),
      );
      return `Downloading on-device model: ${percent}%`;
    }
    case "device-generate":
      return "Checking this message on your device...";
    case "device-error":
      return "On-device inference unavailable; trying cloud...";
    case "cloud-generate":
      return String(status.reason || "").toLowerCase().includes("pdf")
        ? "Sending PDF text to cloud..."
        : "Sending to cloud...";
    case "cloud-error":
      return "Cloud analysis failed; showing the rule-based result...";
    case "response-error":
      return "Preparing the rule-based result...";
    case "rules-only":
      return "Showing the rule-based result...";
    case "done":
      return "";
    default:
      return null;
  }
}
