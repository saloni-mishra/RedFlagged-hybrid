import { getGenerativeModel, InferenceMode } from "firebase/ai";
import { ai } from "./firebase.js";

const out = document.getElementById("out");
const deviceButton = document.getElementById("run-device");
const cloudButton = document.getElementById("run-cloud");

async function runTest(label, mode, initializeDevice) {
  out.textContent = `${label}: starting...`;

  try {
    const model = getGenerativeModel(ai, { mode });

    if (initializeDevice) {
      await model.initializeDeviceModel((val) => {
        out.textContent = `${label} model progress: ${Math.round(val * 10000) / 100}%`;
      });
    }

    const result = await model.generateContent("Say hello in one sentence.");
    out.textContent = `${label}:\n\n${result.response.text()}`;
  } catch (err) {
    out.textContent = `${label} error: ${err.message}`;
    console.error(err);
  }
}

deviceButton.addEventListener("click", () => {
  runTest("On-device", InferenceMode.ONLY_ON_DEVICE, true);
});

cloudButton.addEventListener("click", () => {
  runTest("Cloud", InferenceMode.ONLY_IN_CLOUD, false);
});
