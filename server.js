const ws = require('ws');
const jwt = require('jsonwebtoken');
require('dotenv').config({path: '../../docker/.env'});
const mysql = require('mysql2');

const server = require('http').createServer(function (request, response) {

}).listen(8000);

const wss = new ws.Server({
    server: server
});

db();

let onlineName = [];
let onlineId = [];
let activeSessions = new Map();

wss.on('connection', ws => {
    ws.on('message', message => messageEvent(message, ws));
});

const messageEvent = (message, ws) => {

    const messages = JSON.parse(message);
    if (!messages || !messages.event || !messages.payload) return;

    switch (messages.event) {

        case 'connection': {
            let token = messages.payload.token;
            if (!token) return;

            let decoded;
            try {
                // Проверям корректность токена
                decoded = jwt.verify(token, process.env.KEY);
            } catch (e) {
                console.log('Error: ' + e);
                ws.close();
            }

            let id = decoded.data.id;
            let name = decoded.data.firstname;
            if (!id || !name) return;

            if (onlineId.indexOf(id) === -1) {
                // Добавляем пользователя в массив онлайн пользователей
                addUser(id, name);
                infoMessage(name, 'подключился к чату');
                activeSessions.set(id, 1);
            } else {
                activeSessions.set(id, activeSessions.get(id) + 1);
            }
            sendMessagesFromDb(1, ws);

            sendOnlineList();
        }
            break;

        case 'message': {
            let name = messages.payload.name;
            let message = messages.payload.message;
            if (!name || !message || message === '') return;

            history([name, message]);
            broadcastMessage(name, message);
        }
            break;

        case 'disconnection': {
            let name = messages.payload.name;
            let id = messages.payload.id;
            if (!id || !name) return;

            if (singleActiveSession(id)) {
                deleteUser(id, name);
                sendOnlineList();
                infoMessage(name, 'отключился от чата');
                ws.close();
            } else {
                activeSessions.set(id, activeSessions.get(id) - 1);
            }
        }
            break;

        case 'getPageMessage': {
            const page = messages.payload.page;
            if (!page) return;

            sendMessagesFromDb(page, ws);
        }
            break;

        case 'exit': {
            let name = messages.payload.name;
            let id = messages.payload.id;
            if (!id || !name) return;

            wss.clients.forEach(client => {
                client.send(JSON.stringify({event: 'checkToken', payload: {userName}}))
            });

            deleteUser(id, name);
            sendOnlineList();
            infoMessage();
            activeSessions.delete(id);
        }
        break;
    }
}

function broadcastMessage(name, message) {
    if (!name || !message) return;

    wss.clients.forEach(client => client.send(JSON.stringify({
        event: 'message',
        payload: {name, message}
    })));
}

function db() {
    db = mysql.createConnection({
        host: process.env.MYSQL_HOST,
        user: process.env.MYSQL_USER,
        database: process.env.MYSQL_DATABASE_CHAT,
        password: process.env.MYSQL_PASSWORD,
        port: 3306
    });

    db.connect(function (err) {
        if (err) {
            return console.error("Error: " + err.message);
        } else {
            console.log("OK!");
        }
    })
}

function history(data) {
    db.query("INSERT INTO messages (id, name, message) VALUES (NULL, ?, ?)", data, function (err, results) {
    });
}

function sendMessagesFromDb(page, ws) {
    if (!page) return;

    let event = page === 1 ? 'loadingFirstPage' : 'loadingPage';

    const limit = 50;
    const offset = (page - 1) * limit;
    db.query("SELECT * FROM messages ORDER BY id desc limit ?, ?", [offset, limit], function (err, results) {
        ws.send(JSON.stringify({event: event, payload: {results}}));
    });
}

function addUser(id, name) {
    if (!id || !name) return;

    onlineName.push(name);
    onlineId.push(id);
}

function deleteUser(id, name) {
    if (!id || !name) return;

    onlineName.splice(onlineId.indexOf(id), 1);
    onlineId.splice(onlineId.indexOf(name), 1);
}

function singleActiveSession(id) {
    if (!id) return false;

    return activeSessions.get(id) === 1;
}

function sendOnlineList() {
    wss.clients.forEach(client => client.send(JSON.stringify({
        event: 'sendOnlineList',
        payload: {onlineName}
    })));
}

function infoMessage(name, message) {
    if (!name || !message) return;

    wss.clients.forEach(client => client.send(JSON.stringify({
        event: 'infoMessage',
        payload: {name, message}
    })));
}



