import express, { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { google, calendar_v3 } from "googleapis";
import moment from "moment";
import { OAuth2Client } from "google-auth-library";
import axios from "axios";

const app = express();
app.use(express.json());

// Caminho para o arquivo de credenciais e tokens
const credentialsPath = path.join(__dirname, "../src/credentials.json");
const tokensPath = path.join(__dirname, "../token.json");

// Carregar as credenciais do cliente OAuth2
const credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf-8"));
const { client_secret, client_id, redirect_uris } = credentials;

// Configurar o OAuth2Client
const oAuth2Client = new google.auth.OAuth2(
  client_id,
  client_secret,
  redirect_uris[0]
);

// Middleware para carregar os tokens antes de cada requisição
app.use(async (req, res, next) => {
  try {
    const tokens = JSON.parse(fs.readFileSync(tokensPath, "utf-8"));
    oAuth2Client.setCredentials(tokens);

    // Verificar se o access token expirou
    if (!oAuth2Client.credentials || !oAuth2Client.credentials.access_token) {
      const newTokens = await oAuth2Client.refreshAccessToken();
      oAuth2Client.setCredentials(newTokens.credentials);
      fs.writeFileSync(tokensPath, JSON.stringify(newTokens.credentials));
    }

    next();
  } catch (error) {
    console.error("Erro ao carregar os tokens:", error);
    res.status(401).send("Usuário não autenticado");
  }
});

// Rota de autenticação
app.get("/auth", (req: Request, res: Response) => {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/calendar",
      // "https://mail.google.com/",
      // "https://www.googleapis.com/auth/gmail.modify",
      // "https://www.googleapis.com/auth/gmail.readonly",
      // "https://www.googleapis.com/auth/gmail.metadat",
    ],
  });
  res.redirect(authUrl);
});

// Rota de callback para receber o código de autenticação
app.get("/oauth2callback", async (req: Request, res: Response) => {
  const code = req.query.code as string;

  if (!code) {
    return res.status(400).send("Código de autorização não fornecido");
  }

  try {
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);

    // Verificar se temos um refresh token e salvá-lo
    if (tokens.refresh_token) {
      fs.writeFileSync(tokensPath, JSON.stringify(tokens));
    } else {
      // Se não houver refresh token, carregar o existente e combiná-lo
      const existingTokens = JSON.parse(fs.readFileSync(tokensPath, "utf-8"));
      const updatedTokens = { ...existingTokens, ...tokens };
      fs.writeFileSync(tokensPath, JSON.stringify(updatedTokens));
    }

    res.status(200).send("Autenticação realizada com sucesso!");
  } catch (error) {
    console.error("Erro ao recuperar tokens:", error);
    res.status(500).send("Erro ao recuperar tokens");
  }
});

// Rota para criar um evento no Google Calendar
app.post("/create-event", async (req: Request, res: Response) => {
  try {
    const calendar = google.calendar({ version: "v3", auth: oAuth2Client });

    // Dados do evento recebidos no corpo da requisição
    const { summary, location, description, startTime, endTime, timeZone } =
      req.body;

    console.log("startTime", startTime);
    // Criação do evento
    const event = {
      summary,
      location,
      description,
      start: {
        dateTime: moment(startTime).format(), // Convertendo para o formato ISO 8601
        timeZone,
      },
      end: {
        dateTime: moment(endTime).format(),
        timeZone,
      },
    };

    // Inserir o evento no Google Calendar
    const response = await calendar.events.insert({
      calendarId: "primary",
      requestBody: event,
    });

    // Pega o link do evento criado
    const eventLink = response.data.htmlLink;
    // console.log(response.data);
    console.log("Evento criado:", eventLink);

    // Resposta de sucesso, incluindo o link para o evento
    res.json({ eventLink }).status(200);
  } catch (error) {
    console.error("Erro ao criar o evento:", error);
    res.status(500).send(`Erro ao criar o evento \n ${error}`);
  }
});

// Endpoint para listar os agendamentos do Google Calendar
app.get("/list-events", async (req: Request, res: Response) => {
  try {
    const calendar = google.calendar({ version: "v3", auth: oAuth2Client });

    // Definir o intervalo de tempo para buscar os eventos (opcional)
    const timeMin = moment().startOf("day").toISOString(); // Início do dia atual
    const timeMax = moment().endOf("month").toISOString(); // Fim do mês atual

    const response = await calendar.events.list({
      calendarId: "primary",
      timeMin: timeMin,
      timeMax: timeMax,
      singleEvents: true,
      orderBy: "startTime",
    });

    const events = response.data.items;

    if (events?.length) {
      res.json(events).status(200);
    } else {
      res.status(404).send("Nenhum evento encontrado.");
    }
  } catch (error) {
    console.error("Erro ao listar os eventos:", error);
    res.status(500).send(`Erro ao listar os eventos \n ${error}`);
  }
});

app.post("/list-events-day", async (req: Request, res: Response) => {
  try {
    const calendar = google.calendar({ version: "v3", auth: oAuth2Client });

    const dateString = req.body.date;
    const dateMoment = moment(dateString, "DD/MM/YYYY"); // Specify locale

    // Definir o intervalo de tempo para buscar os eventos (opcional)
    const timeMin = dateMoment.startOf("day").toISOString(); // Início do dia atual
    const timeMax = dateMoment.endOf("day").toISOString(); // Fim do dia atual

    const response = await calendar.events.list({
      calendarId: "primary",
      timeMin: timeMin,
      timeMax: timeMax,
      singleEvents: true,
      orderBy: "startTime",
    });

    const events = response.data.items;
    console.log(events);
    if (events?.length) {
      res.json(events).status(200);
    } else {
      res.json([]).status(200);
    }
  } catch (error) {
    console.error("Erro ao listar os eventos:", error);
    res.status(500).send(`Erro ao listar os eventos \n ${error}`);
  }
});

app.post("/list-events-at-end-year", async (req: Request, res: Response) => {
  try {
    const calendar = google.calendar({ version: "v3", auth: oAuth2Client });

    const dateString = req.body.date;
    const dateMoment = moment(dateString, "dd/MM/yyyy");

    // Definir o intervalo de tempo para buscar os eventos (opcional)
    const timeMin = dateMoment.toISOString(); // Início do dia atual
    const timeMax = dateMoment.endOf("year").toISOString(); // Fim do mês atual

    const response = await calendar.events.list({
      calendarId: "primary",
      timeMin: timeMin,
      timeMax: timeMax,
      singleEvents: true,
      orderBy: "startTime",
    });

    const events = response.data.items;

    if (events?.length) {
      res.json(events).status(200);
    } else {
      res.json([]).status(200);
    }
  } catch (error) {
    console.error("Erro ao listar os eventos:", error);
    res.status(500).send(`Erro ao listar os eventos \n ${error}`);
  }
});

// Rota para deletar um evento no Google Calendar
app.delete("/delete-event", async (req: Request, res: Response) => {
  try {
    const calendar = google.calendar({ version: "v3", auth: oAuth2Client });

    console.log("req.query", req.query);
    // Pegando o eventId da query string
    const eventId = req.query.eventId as string;

    if (!eventId) {
      return res
        .status(400)
        .send({ success: false, message: "eventId não fornecido." });
    }

    await calendar.events.delete({
      calendarId: "primary",
      eventId: eventId,
    });
    console.log(`Evento ${eventId} deletado com sucesso.`);

    // Resposta de sucesso, incluindo o link para o evento
    res.json(true).status(200);
  } catch (error: any) {
    console.error(`Erro ao deletar o evento: ${error.message}`);
    res.status(500).send(`Erro ao deletar o evento: ${error.message}`);
  }
});

app.post("/create-meet", async (req: Request, res: Response) => {
  try {
    const calendar = google.calendar({ version: "v3", auth: oAuth2Client });

    // Dados do evento para o Google Meet
    const { summary, description, startTime, endTime, timeZone } = req.body;

    const event: calendar_v3.Schema$Event = {
      summary,
      description,
      start: {
        dateTime: moment(startTime).format(), // Convertendo para o formato ISO 8601
        timeZone,
      },
      end: {
        dateTime: moment(endTime).format(),
        timeZone,
      },
      conferenceData: {
        createRequest: {
          requestId: "sample123", // Um ID único para identificar a solicitação
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    };

    // Inserir o evento no Google Calendar com Google Meet
    const response = await calendar.events.insert({
      calendarId: "primary",
      requestBody: event,
      conferenceDataVersion: 1,
    });

    console.log("Evento criado: ", response.data.htmlLink);

    const meetLink = response.data.conferenceData?.entryPoints?.find(
      (entry) => entry.entryPointType === "video"
    )?.uri;

    console.log("Link do Google Meet: ", meetLink);

    // Resposta de sucesso, incluindo o link para o Google Meet
    res.status(200).json({ meetLink });
  } catch (error) {
    console.error("Erro ao criar o evento:", error);
    res.status(500).send(`Erro ao criar a reunião no Google Meet \n ${error}`);
  }
});

// Endpoint para receber notificações de alterações nos eventos do Google Calendar
app.post("/webhook", async (req: Request, res: Response) => {
  const channelId = req.headers["x-goog-channel-id"];
  const resourceState = req.headers["x-goog-resource-state"];
  const resourceId = req.headers["x-goog-resource-id"];

  console.log("Notificação recebida:");
  console.log(`Channel ID: ${channelId}`);
  console.log(`Resource State: ${resourceState}`);
  console.log(`Resource ID: ${resourceId}`);

  if (resourceState === "exists") {
    try {
      // Instanciar o cliente do Google Calendar
      const calendar = google.calendar({ version: "v3", auth: oAuth2Client });

      // Consultar o evento usando o resourceId
      const response = await calendar.events.get({
        calendarId: "primary",
        eventId: resourceId as string, // Garantir que o resourceId é uma string
      });

      const updatedEvent = response.data;

      // Processar o evento atualizado (exemplo: salvar em um banco de dados ou sincronizar com o CRM)
      console.log("Evento atualizado:", updatedEvent);

      // Aqui você pode implementar a lógica adicional para lidar com o evento atualizado
    } catch (error) {
      console.error("Erro ao buscar o evento atualizado:", error);
    }
  }

  res.status(200).send("Notificação recebida com sucesso");
});

// Função para criar um canal de notificações para eventos do Google Calendar
app.post("/watch-events", async (req: Request, res: Response) => {
  try {
    const calendar = google.calendar({ version: "v3", auth: oAuth2Client });

    const watchResponse = await calendar.events.watch({
      calendarId: "primary",
      requestBody: {
        id: "7", // Identificador único para o canal de notificação
        type: "web_hook",
        address: "https://2db6-168-205-85-49.ngrok-free.app/webhook", // URL do webhook
      },
    });

    console.log("Watch response:", watchResponse.data);
    res.status(200).json(watchResponse.data);
  } catch (error) {
    console.error("Erro ao configurar o watch:", error);
    res.status(500).send(`Erro ao configurar o watch \n ${error}`);
  }
});

app.post("/get-email-reply", async (req, res) => {
  try {
    const headerValue = req.query.messageId as string;
    if (!headerValue) {
      return res.status(400).json({ message: "Missing messageId" });
    }

    const messageId = headerValue.replace(/[<>]/g, "");
    console.log("messageId processado (sem <>):", messageId);

    const gmail = google.gmail({ version: "v1", auth: oAuth2Client });
    const query = `rfc822msgid:${messageId}`;

    // Lista mensagens com base no ID fornecido
    const response = await gmail.users.messages.list({
      userId: "me",
      q: query,
    });

    const messages = response.data.messages || [];
    if (messages.length === 0) {
      console.log("Nenhuma mensagem encontrada para o messageId:", messageId);
      return res.json({ message: "No replies found", data: [] });
    }

    console.log(
      `Encontradas ${messages.length} mensagens. Buscando thread completa...`
    );

    // Obtém a thread da primeira mensagem
    if (!messages[0].threadId) {
      return res.status(400).json({ message: "Thread ID not found" });
    }

    const threadResponse = await gmail.users.threads.get({
      userId: "me",
      id: messages[0].threadId,
    });

    const threadData = await threadResponse;
    const threadMessages = threadData.data?.messages || [];
    console.log(`Mensagens na thread: ${threadMessages.length}`);
    ("");
    threadMessages.forEach((msg, index) => {
      console.log(`Mensagem ${index + 1}:`);
      console.log(
        "De:",
        msg.payload?.headers?.find((header) => header.name === "From")?.value
      );
      console.log(
        "Para:",
        msg.payload?.headers?.find((header) => header.name === "To")?.value
      );
      console.log(
        "Assunto:",
        msg.payload?.headers?.find((header) => header.name === "Subject")?.value
      );
      console.log(
        "Referências:",
        msg.payload?.headers?.find((header) => header.name === "References")
          ?.value
      );
      console.log("Thread ID:", msg.threadId);
    });

    // Filtra a mensagem de resposta (analisar headers `From` e `To`)
    const replyMessage = threadMessages.reverse().find((msg) => {
      const headers = msg.payload?.headers || [];
      const fromHeader =
        headers.find((header) => header.name === "From")?.value || "";
      const toHeader =
        headers.find((header) => header.name === "To")?.value || "";
      const referencesHeader =
        headers.find((header) => header.name === "References")?.value || "";

      return (
        fromHeader &&
        !fromHeader.includes("tcabralti@gmail.com") && // Resposta de outra pessoa
        toHeader.includes("tcabralti@gmail.com") && // Enviada para você
        referencesHeader.includes(
          "<dc4ef3f8-a7f8-78ec-a919-147b3168b1ab@gmail.com>"
        ) // Referência correta
      );
    });

    if (!replyMessage) {
      return res.json({ message: "No reply found in thread" });
    }

    // Decodifica o corpo da mensagem de resposta
    const bodyPart = replyMessage.payload?.parts?.find(
      (part: { mimeType?: string | null }) =>
        part.mimeType === "text/plain" || part.mimeType === "text/html"
    );

    let replyBody = "";
    if (bodyPart?.body?.data) {
      replyBody = Buffer.from(bodyPart.body.data, "base64").toString("utf-8");
    }

    res.json({
      message: "Reply retrieved successfully",
      subject:
        replyMessage.payload?.headers?.find(
          (header) => header.name === "Subject"
        )?.value || "No subject",
      body: replyBody || "No body content available",
    });
  } catch (error) {
    console.error("Erro ao buscar mensagens:", error);
    if (axios.isAxiosError(error)) {
      res.status(error.response?.status || 500).json({
        message: error.response?.data.error.message || "Erro desconhecido",
      });
    } else if (error instanceof Error) {
      res.status(500).json({ message: error.message });
    } else {
      res.status(500).json({ message: "Error retrieving replies" });
    }
  }
});

// Iniciar o servidor
const PORT = 5000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
