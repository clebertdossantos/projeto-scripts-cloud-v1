const { loginContabilCloud } = require("./login-cloud");
const {
  chaveAcesso,
  buscaArquivoGroovy,
  publicarScripts,
  executarScript,
  getLogExecucaoScript,
  statusExecucaoScript,
} = require("./utils");
const dotenv = require("dotenv");
const { log } = require("node:console");
const { existsSync, readFileSync } = require("node:fs");
const { resolve } = require("node:path");
dotenv.config({ path: "../config/.env" });
const cfg_cloud = existsSync(resolve(__dirname, "../config/config.json"))
  ? require("../config/config.json")
  : undefined;
const entidades = JSON.parse(
  readFileSync(resolve(__dirname, "../config/entidades.json"), "utf-8")
);
const entidade = entidades.find(
  (ent) => ent.id === parseInt(process.env.ENTIDADE)
);
log(`🎯 ${entidade.id} - ${entidade.nome}`);
// log("🚀 Iniciando o processo de publicação de scripts");
let processos = process.argv.slice(2, process.argv.length);
// log(processos);
(async () => {
  if (!cfg_cloud || (await chaveAcesso(cfg_cloud))) {
    await loginContabilCloud(); // 🫡 login no sistema
  }
  let { authorizationCloud } = cfg_cloud;

  if (processos.includes("buscar")) {
    await buscaArquivoGroovy(authorizationCloud);
  }
  if (processos.includes("publicar")) {
    log("🚀 Iniciando o processo de publicação de scripts");
    await publicarScripts(authorizationCloud);
  }
  if (processos.includes("executar")) {
    let [_, ...scripts] = processos.join("").split("executar");
    scripts = scripts.filter((pp) => pp !== "");
    if (scripts.length === 1) {
      await executarScript(authorizationCloud, scripts[0]);
    } else {
      console.error(
        `❌ Problemas nos ids de script, envie apenas um id por vez!`
      );
    }
  }
  if (processos.includes("logs")) {
    let [_, ...args] = processos.join("").split("logs");
    args = args.filter((pp) => pp !== "");
    if (args.length === 1) {
      let protocolo = args.find((pp) => pp);
      await getLogExecucaoScript(authorizationCloud, protocolo);
    } else {
      console.error(
        `❌ Problemas com protoloco de execução, envie apenas um protocolo por vez!`
      );
    }
  }

  if (processos.includes("status")) {
    let [_, ...args] = processos.join("").split("status");
    args = args.filter((pp) => pp !== "");
    if (args.length === 1) {
      let protocolo = args.find((pp) => pp);
      await statusExecucaoScript(protocolo);
    } else {
      console.error(
        `❌ Problemas com protoloco de execução, envie apenas um protocolo por vez!`
      );
    }
  }
})();
