const puppeteer = require("puppeteer");
const { log } = require("node:console");
const dotenv = require("dotenv");
const { readFileSync, writeFileSync, existsSync } = require("node:fs");
const { resolve } = require("node:path");
const envPath = resolve(__dirname, "../config/.env");
dotenv.config({ path: envPath });
const cfg_cloud = existsSync(resolve(__dirname, "../config/config.json"))
  ? require("../config/config.json")
  : {};
const sistema = new Map([
  [68, "https://contabil.betha.cloud"],
  [61, "https://planejamento.betha.cloud"],
  [67, "https://tesouraria.betha.cloud"],
  [151, "https://prestacao-contas.betha.cloud"],
]);

// console.log("Arquivo .env existe?", existsSync(envPath));
// console.log("SENHA carregada?", process.env.SENHA);

async function waitForTimeout(milliseconds = 2000) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function loginBase64() {
  return Buffer.from(
    `database:${process.env.DATABASE},entity:${process.env.ENTIDADE}`
  ).toString("base64");
}

async function selecionarPPA(pagina) {
  const elementoEncontrado = await pagina.evaluate(() => {
    // Selecionar a tabela
    const ppas = document.querySelector(
      '[class="nav nav-tabs nav-stacked nav-media"]'
    );
    if (!ppas) return null;
    const itens = ppas.querySelectorAll("[data-ng-repeat]");
    for (let el of itens) {
      const heading = el.querySelector("a > h3");
      const btn = el.querySelector("a");
      if (heading && heading.textContent.includes("PPA 2022 - 2025")) {
        btn.click(); // Clica no elemento
        return `✅ ${heading.textContent}`;
      }
    }
    return "PPA não encontrado";
  });
  log(elementoEncontrado);
}

async function selecionarExercicio(pagina) {
  const elementoEncontrado = await pagina.evaluate(() => {
    let exercicios = document.querySelectorAll(
      '[data-bf-loading="SelecaoExercicioCtrl.tracker.exercicios"] > li'
    );
    // console.log(exercicios);
    if (!exercicios) return null;
    for (let el of exercicios) {
      let heading = el.querySelector("a > h3");
      let btn = el.querySelector("a");
      // console.log(`>> ${heading.textContent}`);
      if (heading && heading.textContent.includes(`Exercício 2025`)) {
        btn.click(); // Clica no elemento
        return `✅ ${heading.textContent}`;
      }
    }
    return "LOA não encontrado";
  });
  log(elementoEncontrado);
}

async function loginContabilCloud() {
  const browser = await puppeteer.launch({
    headless: true, // Desativa o modo headless para visualização
    // devtools: true, // Ativa o modo Developer Tools
    // defaultViewport: null, // Remove restrições de viewport padrão
    // args: ["--start-maximized"], // Maximiza a janela
  });
  log("🤞Iniciando login no sistema");
  let url_sistema = sistema.get(parseInt(process.env.SISTEMA));
  const page = await browser.newPage();
  await page.goto(url_sistema);
  await page.setViewport({ width: 1080, height: 1024 });

  //O método waitForSelector aguarda até que o seletor informado esteja presente no DOM.
  //O parâmetro visible: true garante que o elemento também esteja visível.
  //IDs que possuem dois pontos : devem ser escapados no seletor CSS com uma barra invertida (\\:).
  //   log(process.env.USUARIO);
  //   log(process.env.SENHA);
  await page.waitForSelector("#login\\:iUsuarios", { visible: true });
  await page.type("#login\\:iUsuarios", process.env.USUARIO);
  await page.type("#login\\:senha", process.env.SENHA);
  await page.click("#login\\:btAcessar");
  await page.waitForNavigation({ waitUntil: "domcontentloaded" });
  await waitForTimeout();
  await page.goto(`${url_sistema}/#/entidades/${loginBase64()}`);
  await page.waitForSelector('[class="nav nav-tabs nav-stacked nav-media"]', {
    visible: true,
  });
  await waitForTimeout();
  let ppa = await selecionarPPA(page);
  //   console.log(ppa);
  await waitForTimeout();
  await selecionarExercicio(page);
  let autorizacao = await page.evaluate(() => {
    return angular
      .element("[data-ng-app]")
      .injector()
      .get("AuthenticationContext")
      .getAccessToken();
  });

  let user_access = await page.evaluate(() => {
    return angular
      .element("[data-ng-app]")
      .injector()
      .get("UserAccessContext")
      .getUserAccess().licenseId;
  });
  if (!cfg_cloud) {
    cfg_cloud = {
      authorizationCloud: {
        "App-Context": `${Buffer.from(
          JSON.stringify({ exercicio: process.env.EXERCICIO })
        ).toString("base64")}`,
        Authorization: `Bearer ${autorizacao}`,
        "User-Access": user_access,
        "Content-Type": "application/json;charset=UTF-8",
      },
      entidade: process.env.ENTIDADE,
      database: process.env.DATABASE,
    };
  } else {
    cfg_cloud.authorizationCloud = {
      "App-Context": `${Buffer.from(
        JSON.stringify({ exercicio: parseInt(process.env.EXERCICIO) })
      ).toString("base64")}`,
      Authorization: `Bearer ${autorizacao}`,
      "User-Access": user_access,
      "Content-Type": "application/json;charset=UTF-8",
    };
    cfg_cloud.entidade = process.env.ENTIDADE;
    cfg_cloud.database = process.env.DATABASE;
  }

  await browser.close();
  writeFileSync(
    resolve(__dirname, "../config/config.json"),
    JSON.stringify(cfg_cloud, null, 2)
  );
}

module.exports = { loginContabilCloud };
