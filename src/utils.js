const axios = require("axios");
const { log } = require("node:console");
const {
  readFileSync,
  readdirSync,
  writeFileSync,
  existsSync,
  unlinkSync,
  mkdirSync,
  createReadStream,
} = require("node:fs");
const unzipper = require("unzipper");
const { resolve, extname, join } = require("node:path");
const FormData = require("form-data");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const tipoParametroMap = new Map([
  [0, "INTEIRO"],
  [1, "VALOR"],
  [2, "CARACTER"],
  [3, "DATA"],
  [4, "LISTA_OPCOES"],
  [5, "ARQUIVO"],
  [6, "LISTA_MULTIPLA"],
  [7, "MES_ANO"],
  [8, "DATA_HORA"],
  [9, "SENHA"],
]);

async function downloadAndExtractZip(codigoExecucao) {
  try {
    const response = await axios.get(
      `https://plataforma-execucoes.betha.cloud/v1/download/api/execucoes/${codigoExecucao}/resultado`,
      {
        responseType: "arraybuffer", // Para receber o arquivo binário
      }
    );
    // Definindo o caminho completo do arquivo para salvar
    const filePath = join(__dirname, `../res/${codigoExecucao}.zip`);
    // Salvando o arquivo ZIP no disco
    writeFileSync(filePath, response.data);
    console.log(`🔥 Arquivo ${codigoExecucao}.zip baixado com sucesso!`);
    // Criando a pasta 'resp' caso ela não exista
    const respPath = join(__dirname, "../res");
    if (!existsSync(respPath)) {
      mkdirSync(respPath);
    }
    // Abrindo o arquivo ZIP e extraindo seu conteúdo para a pasta 'resp'
    await createReadStream(filePath)
      .pipe(unzipper.Extract({ path: respPath }))
      .promise(); // Usamos o .promise() para garantir que o processo de extração seja assíncrono
    unlinkSync(filePath);
  } catch (error) {
    console.error("❌ Erro durante o download ou extração do arquivo:", error);
  }
}

async function statusExecucaoScript(codigoExecucao) {
  while (true) {
    await sleep(10000); // 5 segundos
    let response = await axios.get(
      `https://plataforma-execucoes-v2.betha.cloud/api/consulta/${codigoExecucao}`
    );
    let { status, tipoConclusao, mensagemConclusao, gerouResultado } =
      response.data;
    // log(response.data);
    if (status.value === "CONCLUIDO") {
      if (tipoConclusao.value !== "SUCESSO") {
        log(`❌ - ${mensagemConclusao}`);
      } else {
        log(`✅ - ${mensagemConclusao}`);
      }
      if (gerouResultado) {
        await downloadAndExtractZip(codigoExecucao);
      }
      return;
    }
  }
}

async function limparGitHub() {
  let content = readdirSync(resolve(__dirname, "../content"));
  for (pasta of content) {
    let caminho = readdirSync(resolve(__dirname, `../content/${pasta}`));
    for (arq of caminho) {
      unlinkSync(resolve(__dirname, `../content/${pasta}/${arq}`));
    }
  }
  let logs = readdirSync(resolve(__dirname, "../logs"));
  for (arq of logs) {
    unlinkSync(resolve(__dirname, `../logs/${arq}`));
  }
  let scripts = readdirSync(resolve(__dirname, "../scripts"));
  for (arq of scripts) {
    unlinkSync(resolve(__dirname, `../scripts/${arq}`));
  }
  let downloads = readdirSync(resolve(__dirname, "../res"));
  for (arq of downloads) {
    unlinkSync(resolve(__dirname, `../res/${arq}`));
  }
}

async function getLogExecucaoScript(authorizationCloud, protocolo, idScript) {
  let url = `https://plataforma-execucoes.betha.cloud/v1/api/execucoes/${protocolo}/log-stream`;
  log(`🔥 Consultando log da execução ${protocolo}`);
  // log(url);
  let headers = authorizationCloud;
  let params = {};
  let processedTokens = new Set();
  let nextToken = null;
  let arquivo = [];
  while (true) {
    try {
      const response = await axios.get(url, { headers, params });
      let { nextForwardToken, events } = response.data;
      if (events) {
        // console.log(response.data.events.map((pp) => pp.message).join("\n"));
        arquivo = [...arquivo, ...events.map((pp) => pp.message)];
      }
      if (!nextForwardToken || processedTokens.has(nextForwardToken)) {
        break;
      }
      // Armazena o token processado e faz a próxima requisição
      processedTokens.add(nextForwardToken);
      nextToken = nextForwardToken;
      params = nextToken ? { nextToken } : {};
    } catch (ee) {
      break;
    }
  }
  writeFileSync(
    resolve(__dirname, `../logs/${idScript}.txt`),
    arquivo.join("\n")
  );
}

async function chaveAcesso(cfg) {
  try {
    let {
      data: { expired },
    } = await axios.get(
      `https://plataforma-oauth.betha.cloud/auth/oauth2/tokeninfo?access_token=${cfg.authorizationCloud.Authorization.replace(
        "Bearer ",
        ""
      )}`
    );
    return expired;
  } catch (ee) {
    return true;
  }
}

function getArquivos() {
  let estruturaPastas = {
    content: ["db", "data", "parametros"],
    logs: [],
    res: [],
    scripts: [],
  };
  const basePath = resolve(__dirname, "../");
  Object.keys(estruturaPastas).forEach((pasta) => {
    const pastaPath = join(basePath, pasta);
    if (!existsSync(pastaPath)) {
      mkdirSync(pastaPath, { recursive: true });
      log(`📁 Criado: ${pastaPath}`);
    }

    // Criando subpastas dentro de cada diretório
    estruturaPastas[pasta].forEach((subpasta) => {
      const subPastaPath = join(pastaPath, subpasta);
      if (!existsSync(subPastaPath)) {
        mkdirSync(subPastaPath, { recursive: true });
        log(`📂 Criado: ${subPastaPath}`);
      }
    });
  });

  let arquivos = readdirSync(resolve(__dirname, "../scripts"))
    .filter((arq) => extname(arq) === ".groovy")
    .map((arq) => arq.replace(/\.groovy/, ""));

  let pastas = readdirSync(resolve(__dirname, "../content"));
  for (pasta of pastas) {
    let caminho = readdirSync(resolve(__dirname, `../content/${pasta}`));
    for (arq of caminho) {
      if (arq === "scripts.json") continue;
      if (!arquivos.includes(arq.replace(extname(arq), ""))) {
        unlinkSync(resolve(__dirname, `../content/${pasta}/${arq}`));
      }
    }
  }
  let arqs_logs = readdirSync(resolve(__dirname, "../logs"));
  for (arq of arqs_logs) {
    if (!arquivos.includes(arq.replace(extname(arq), ""))) {
      unlinkSync(resolve(__dirname, `../logs/${arq}`));
    }
  }
  let arqs_download = readdirSync(resolve(__dirname, "../res"));
  for (arq of arqs_download) {
    unlinkSync(resolve(__dirname, `../res/${arq}`));
  }

  return arquivos;
}

async function buscaArquivoGroovy(authorizationCloud) {
  let arquivos = getArquivos();
  let estrutura_scripts = [];
  for (idScript of arquivos) {
    //* busca os scripts
    let response_scripts = await axios.get(
      `https://plataforma-extensoes.betha.cloud/api/extensao/SCRIPT/${idScript}`,
      {
        headers: authorizationCloud,
      }
    );
    let { titulo, referencia, contexto } = response_scripts.data;
    // log(id);
    // log(titulo);
    // log(referencia);
    // log(contexto);
    let response_revisao = await axios.post(
      `https://plataforma-scripts.betha.cloud/scripts/v1/api/scripts/${referencia.id}/acoes/rascunho`,
      JSON.stringify({}),
      {
        headers: authorizationCloud,
      }
    );
    let { id, revisao, codigoFonte } = response_revisao.data;
    // log(response_revisao.data);
    // log(revisao);
    estrutura_scripts.push([idScript, titulo, id, parseInt(revisao.descricao)]);
    // return;
    //* busca os parâmetros
    let response_params = await axios.get(
      `https://plataforma-scripts.betha.cloud/scripts/v1/api/rascunhos/${id}/parametros/complete`,
      {
        headers: authorizationCloud,
      }
    );
    let { parametros } = response_params.data;
    let paramsEstrutura = parametros.reduce((acc, param) => {
      const { nome, id } = param;
      const type = tipoParametroMap.get(param.tipo.value);
      acc[nome] = { id, type };
      return acc;
    }, {});
    let params = parametros.reduce((acc, param) => {
      const { nome, id } = param;
      acc[nome] = "";
      return acc;
    }, {});
    // log(JSON.stringify(parametros, null, 2));
    writeFileSync(
      resolve(__dirname, `../content/data/${idScript}.json`),
      JSON.stringify(paramsEstrutura, null, 2)
    );
    if (
      !existsSync(resolve(__dirname, `../content/parametros/${idScript}.json`))
    ) {
      writeFileSync(
        resolve(__dirname, `../content/parametros/${idScript}.json`),
        JSON.stringify(params, null, 2)
      );
    }
    writeFileSync(
      resolve(__dirname, `../scripts/${idScript}.groovy`),
      codigoFonte
    );
  }
  writeFileSync(
    resolve(__dirname, `../content/db/scripts.json`),
    JSON.stringify(
      estrutura_scripts.reduce((acc, [idScript, titulo, id, versao]) => {
        acc[idScript] = { id, titulo, versao };
        return acc;
      }, {}),
      null,
      2
    )
  );
}

async function publicarScripts(authorizationCloud) {
  let arquivos = getArquivos();
  let scripts = JSON.parse(
    readFileSync(resolve(__dirname, "../content/db/scripts.json"))
  );
  for (idScript of arquivos) {
    let revisao = scripts[idScript];
    let fonte = readFileSync(
      resolve(__dirname, `../scripts/${idScript}.groovy`),
      "utf-8"
    );
    const response = await fetch(
      `https://plataforma-scripts.betha.cloud/scripts/v1/api/rascunhos/${revisao.id}/fonte`,
      {
        method: "PUT",
        headers: {
          ...authorizationCloud,
          ...{ accept: "application/json, text/plain, */*" },
        },
        body: fonte, // Se 'fonte' é um objeto que precisa ser enviado no corpo da requisição
      }
    );
    if ([200, 201].includes(response.status)) {
      let response = await axios.post(
        `https://plataforma-scripts.betha.cloud/scripts/v1/api/rascunhos/${revisao.id}/acoes/publicar`,
        {},
        {
          headers: {
            ...authorizationCloud,
            ...{ accept: "application/json, text/plain, */*" },
          },
        }
      );

      if (response.data.error) {
        log(
          `😞⚠️ - Título: ${revisao.titulo} (${idScript}) \n`,
          `${response.data.errors
            .map(
              (pp) => `${pp?.message || "Erro"} - Linha ${pp?.lineNumber || 0}`
            )
            .join("\n")}`
        );
        throw new Error("Erro ao publicar script");
      } else {
        log(`✅ ${revisao.titulo}`, revisao.id);
      }
      log("------------------");
    }
  }
  await buscaArquivoGroovy(authorizationCloud);
}

async function executarScript(authorizationCloud, idScript) {
  await buscaArquivoGroovy(authorizationCloud);
  try {
    let scripts = JSON.parse(
      readFileSync(resolve(__dirname, "../content/db/scripts.json"))
    );
    let parametros = JSON.parse(
      readFileSync(resolve(__dirname, `../content/parametros/${idScript}.json`))
    );
    let paramsEstrutura = JSON.parse(
      readFileSync(resolve(__dirname, `../content/data/${idScript}.json`))
    );
    let detalhes = scripts[idScript];
    const url = `https://plataforma-scripts.betha.cloud/scripts/v1/api/scripts/${idScript}/versoes/${detalhes.versao}/acoes/executar`;
    const params = {
      visibilidadeExecucaoPublica: true,
      enviarEmailAoFinalizar: undefined,
      monitoramentoTempoReal: true,
    };
    const formData = new FormData();
    formData.append("#emailsParaNotificar", "");
    for (el of Object.keys(parametros)) {
      if (parametros[el] === "") continue;
      let tipo = paramsEstrutura[el].type;
      if (tipo === "LISTA_MULTIPLA" || Array.isArray(parametros[el])) {
        formData.append(el, JSON.stringify(parametros[el]));
      } else if (tipo === "LISTA_OPCOES") {
        formData.append(el, JSON.stringify(parametros[el]));
      } else {
        formData.append(el, parametros[el]);
      }
    }
    const headers = {
      ...authorizationCloud,
      ...formData.getHeaders(),
    };
    const response = await axios.post(url, formData, { headers, params });
    let { mensagem, codigoExecucao } = response.data;
    let urlCodigoExecucao = `https://consulta-execucoes.plataforma.betha.cloud/#/${codigoExecucao}`;
    log(`✅ Execução: ${detalhes.titulo}`);
    log(`✅ Parametros: ${JSON.stringify(parametros)}`);
    log(`✅ Protocolo: ${codigoExecucao}`, urlCodigoExecucao);
    await statusExecucaoScript(codigoExecucao);
    await getLogExecucaoScript(authorizationCloud, codigoExecucao, idScript);
  } catch (error) {
    console.error(
      "Erro ao fazer a requisição:",
      error.response ? error.response.data : error.message
    );
  }
}

module.exports = {
  chaveAcesso,
  buscaArquivoGroovy,
  publicarScripts,
  executarScript,
  getLogExecucaoScript,
  statusExecucaoScript,
  limparGitHub,
};
