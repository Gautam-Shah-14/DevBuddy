import chalk from "chalk";
import { getProvider } from "../providers/index.js";
import { getConfig } from "../lib/config.js";

const RECOMMENDED_CODER_MODELS = ["qwen2.5-coder", "devstral", "codellama", "deepseek-coder-v2"];

export async function modelsCommand(): Promise<void> {
  const config = getConfig();
  const provider = getProvider();

  const connected = await provider.checkConnection();
  if (!connected) {
    console.error(chalk.red(`Could not reach the "${provider.name}" provider.`));
    process.exitCode = 1;
    return;
  }

  const models = await provider.listModels();
  if (models.length === 0) {
    console.log(chalk.yellow("No models available."));
    if (provider.name === "ollama") {
      console.log(`Pull a coder model for the best experience, e.g.: ${chalk.cyan("ollama pull qwen2.5-coder")}`);
    }
    return;
  }

  console.log(chalk.bold(`Models available via "${provider.name}":\n`));
  for (const model of models) {
    const isDefault = model === config.model;
    const isCoder = RECOMMENDED_CODER_MODELS.some((c) => model.startsWith(c));
    const tags = [isDefault ? "default" : null, isCoder ? "coder" : null].filter(Boolean).join(", ");
    console.log(`  ${model}${tags ? chalk.dim(`  (${tags})`) : ""}`);
  }

  if (provider.name === "ollama") {
    console.log(
      chalk.dim(
        `\nAny installed model can be used, but coder-focused models (${RECOMMENDED_CODER_MODELS.join(
          ", "
        )}) tend to follow tool-calling instructions more reliably.`
      )
    );
  }
}
