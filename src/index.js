"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const googleapis_1 = require("googleapis");
const moment_1 = __importDefault(require("moment"));
const app = (0, express_1.default)();
app.use(express_1.default.json());
// Caminho para o arquivo de credenciais e tokens
const credentialsPath = path_1.default.join(__dirname, "../src/credentials.json");
const tokensPath = path_1.default.join(__dirname, "../token.json");
// Carregar as credenciais do cliente OAuth2
const credentials = JSON.parse(fs_1.default.readFileSync(credentialsPath, "utf-8"));
const { client_secret, client_id, redirect_uris } = credentials;
// Configurar o OAuth2Client
const oAuth2Client = new googleapis_1.google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
// Middleware para carregar os tokens antes de cada requisição
app.use((req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const tokens = JSON.parse(fs_1.default.readFileSync(tokensPath, "utf-8"));
        oAuth2Client.setCredentials(tokens);
        // Verificar se o access token expirou
        if (!oAuth2Client.credentials || !oAuth2Client.credentials.access_token) {
            const newTokens = yield oAuth2Client.refreshAccessToken();
            oAuth2Client.setCredentials(newTokens.credentials);
            fs_1.default.writeFileSync(tokensPath, JSON.stringify(newTokens.credentials));
        }
        next();
    }
    catch (error) {
        console.error("Erro ao carregar os tokens:", error);
        res.status(401).send("Usuário não autenticado");
    }
}));
// Rota de autenticação
app.get("/auth", (req, res) => {
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: "offline",
        scope: ["https://www.googleapis.com/auth/calendar"],
    });
    res.redirect(authUrl);
});
// Rota de callback para receber o código de autenticação
app.get("/oauth2callback", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const code = req.query.code;
    if (!code) {
        return res.status(400).send("Código de autorização não fornecido");
    }
    try {
        const { tokens } = yield oAuth2Client.getToken(code);
        oAuth2Client.setCredentials(tokens);
        // Verificar se temos um refresh token e salvá-lo
        if (tokens.refresh_token) {
            fs_1.default.writeFileSync(tokensPath, JSON.stringify(tokens));
        }
        else {
            // Se não houver refresh token, carregar o existente e combiná-lo
            const existingTokens = JSON.parse(fs_1.default.readFileSync(tokensPath, "utf-8"));
            const updatedTokens = Object.assign(Object.assign({}, existingTokens), tokens);
            fs_1.default.writeFileSync(tokensPath, JSON.stringify(updatedTokens));
        }
        res.status(200).send("Autenticação realizada com sucesso!");
    }
    catch (error) {
        console.error("Erro ao recuperar tokens:", error);
        res.status(500).send("Erro ao recuperar tokens");
    }
}));
// Endpoint para listar os agendamentos do Google Calendar
app.post("/list-events-day", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const calendar = googleapis_1.google.calendar({ version: "v3", auth: oAuth2Client });
        const { date } = req.body;
        console.log(date);
        // Definir o intervalo de tempo para buscar os eventos (opcional)
        const timeMin = (0, moment_1.default)(date, "DD/MM/YYYY").startOf("day").toISOString(); // Início do dia atual
        const timeMax = (0, moment_1.default)(date, "DD/MM/YYYY").endOf("day").toISOString(); // Fim do mês atual
        const response = yield calendar.events.list({
            calendarId: "primary",
            timeMin: timeMin,
            timeMax: timeMax,
            singleEvents: true,
            orderBy: "startTime",
        });
        const events = response.data.items;
        if (events === null || events === void 0 ? void 0 : events.length) {
            res.json(events).status(200);
        }
        else {
            res.json([]).status(200);
        }
    }
    catch (error) {
        console.error("Erro ao listar os eventos:", error);
        res.status(500).send(`Erro ao listar os eventos \n ${error}`);
    }
}));
app.post("/list-events-at-end-year", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const calendar = googleapis_1.google.calendar({ version: "v3", auth: oAuth2Client });
        const { date } = req.body;
        // Definir o intervalo de tempo para buscar os eventos (opcional)
        const timeMin = (0, moment_1.default)(date, "DD/MM/YYYY").startOf("day").toISOString(); // Início do dia atual
        const timeMax = (0, moment_1.default)(date, "DD/MM/YYYY").endOf("year").toISOString(); // Fim do mês atual
        console.log("timeMax", timeMax);
        const response = yield calendar.events.list({
            calendarId: "primary",
            timeMin: timeMin,
            timeMax: timeMax,
            singleEvents: true,
            orderBy: "startTime",
        });
        const events = response.data.items;
        if (events === null || events === void 0 ? void 0 : events.length) {
            res.json(events).status(200);
        }
        else {
            res.json([]).status(200);
        }
    }
    catch (error) {
        console.error("Erro ao listar os eventos:", error);
        res.status(500).send(`Erro ao listar os eventos \n ${error}`);
    }
}));
// Rota para criar um evento no Google Calendar
app.post("/create-event", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const calendar = googleapis_1.google.calendar({ version: "v3", auth: oAuth2Client });
        // Dados do evento recebidos no corpo da requisição
        const { summary, location, description, startTime, endTime, timeZone } = req.body;
        console.log("startTime", startTime);
        // Criação do evento
        const event = {
            summary,
            location,
            description,
            start: {
                dateTime: (0, moment_1.default)(startTime).format(), // Convertendo para o formato ISO 8601
                timeZone,
            },
            end: {
                dateTime: (0, moment_1.default)(endTime).format(),
                timeZone,
            },
        };
        // Inserir o evento no Google Calendar
        const response = yield calendar.events.insert({
            calendarId: "primary",
            requestBody: event,
        });
        // Pega o link do evento criado
        const eventLink = response.data.htmlLink;
        // console.log(response.data);
        console.log("Evento criado:", eventLink);
        // Resposta de sucesso, incluindo o link para o evento
        res.json({ eventLink }).status(200);
    }
    catch (error) {
        console.error("Erro ao criar o evento:", error);
        res.status(500).send(`Erro ao criar o evento \n ${error}`);
    }
}));
// Rota para deletar um evento no Google Calendar
app.delete("/delete-event", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const calendar = googleapis_1.google.calendar({ version: "v3", auth: oAuth2Client });
        console.log("req.query", req.query);
        // Pegando o eventId da query string
        const eventId = req.query.eventId;
        if (!eventId) {
            return res
                .status(400)
                .send({ success: false, message: "eventId não fornecido." });
        }
        yield calendar.events.delete({
            calendarId: "primary",
            eventId: eventId,
        });
        console.log(`Evento ${eventId} deletado com sucesso.`);
        // Resposta de sucesso, incluindo o link para o evento
        res.json(true).status(200);
    }
    catch (error) {
        console.error(`Erro ao deletar o evento: ${error.message}`);
        res.status(500).send(`Erro ao deletar o evento: ${error.message}`);
    }
}));
app.post("/create-meet", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const calendar = googleapis_1.google.calendar({ version: "v3", auth: oAuth2Client });
        // Dados do evento para o Google Meet
        const { summary, description, startTime, endTime, timeZone } = req.body;
        const event = {
            summary,
            description,
            start: {
                dateTime: (0, moment_1.default)(startTime).format(), // Convertendo para o formato ISO 8601
                timeZone,
            },
            end: {
                dateTime: (0, moment_1.default)(endTime).format(),
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
        const response = yield calendar.events.insert({
            calendarId: "primary",
            requestBody: event,
            conferenceDataVersion: 1,
        });
        console.log("Evento criado: ", response.data.htmlLink);
        const meetLink = (_c = (_b = (_a = response.data.conferenceData) === null || _a === void 0 ? void 0 : _a.entryPoints) === null || _b === void 0 ? void 0 : _b.find((entry) => entry.entryPointType === "video")) === null || _c === void 0 ? void 0 : _c.uri;
        console.log("Link do Google Meet: ", meetLink);
        // Resposta de sucesso, incluindo o link para o Google Meet
        res.status(200).json({ meetLink });
    }
    catch (error) {
        console.error("Erro ao criar o evento:", error);
        res.status(500).send(`Erro ao criar a reunião no Google Meet \n ${error}`);
    }
}));
// Endpoint para receber notificações de alterações nos eventos do Google Calendar
app.post("/webhook", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
            const calendar = googleapis_1.google.calendar({ version: "v3", auth: oAuth2Client });
            // Consultar o evento usando o resourceId
            const response = yield calendar.events.get({
                calendarId: "primary",
                eventId: resourceId, // Garantir que o resourceId é uma string
            });
            const updatedEvent = response.data;
            // Processar o evento atualizado (exemplo: salvar em um banco de dados ou sincronizar com o CRM)
            console.log("Evento atualizado:", updatedEvent);
            // Aqui você pode implementar a lógica adicional para lidar com o evento atualizado
        }
        catch (error) {
            console.error("Erro ao buscar o evento atualizado:", error);
        }
    }
    res.status(200).send("Notificação recebida com sucesso");
}));
// Função para criar um canal de notificações para eventos do Google Calendar
app.post("/watch-events", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const calendar = googleapis_1.google.calendar({ version: "v3", auth: oAuth2Client });
        const watchResponse = yield calendar.events.watch({
            calendarId: "primary",
            requestBody: {
                id: "7", // Identificador único para o canal de notificação
                type: "web_hook",
                address: "https://2db6-168-205-85-49.ngrok-free.app/webhook", // URL do webhook
            },
        });
        console.log("Watch response:", watchResponse.data);
        res.status(200).json(watchResponse.data);
    }
    catch (error) {
        console.error("Erro ao configurar o watch:", error);
        res.status(500).send(`Erro ao configurar o watch \n ${error}`);
    }
}));
// Iniciar o servidor
const PORT = 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
