'use strict';

const co = require('co');
const assert = require('assert')
const mongoClient = require('mongodb').MongoClient;
const mongoUrl = 'mongodb://localhost:27017/learning-assistant-2';
const WebSocketServer = require('ws').Server
const handlers = {
  getQuestionAnswers,
  know,
  dontKnow
};
let wss;

co(function * () {
  const db = yield mongoClient.connect(mongoUrl);

  wss = new WebSocketServer({ port: 8080 });

  let clientId = 0;
  wss.on('connection', (ws) => {
    var thisId = ++clientId;
    console.log('Client #%d connected', thisId);

    ws.on('message', (data) => {
      data = JSON.parse(data);
      const handler = handlers[data.event];
      if (!handler) return;

      return co(function * () {
        yield* handler(db, ws, data);
      }).catch(function(e) {
        console.log('Client #%d error: %s', thisId, e.message);
        console.log(e.stack);
      });
    });

    ws.on('close', function() {
      console.log('Client #%d disconnected', thisId);
    });

    ws.on('error', function(e) {
      console.log('Client #%d error: %s', thisId, e.message);
      console.log(e.stack);
    });
  });
}).catch((e) => {
  console.log(e.stack);
})

function byHash(hash) {
  return function (item) {
    return item.hash === hash;
  };
}

function * getQuestionAnswers(db, ws, event) {
  ws.send(JSON.stringify({ event: 'questionAnswers', questionAnswers: yield* findAllAnswers(db, event.title) }));
}

function * know(db, ws, event) {
  let answer = yield* findAnswer(db, event.hash, event.title);
  if (!answer) answer = yield* createAnswer (db, { hash: event.hash, title: event.title, know: 0, dontKnow: 0 });
  answer.know++;
  yield saveAnswer(db, answer);
  ws.send(JSON.stringify({ event: 'questionAnswer', hash: event.hash, questionAnswer: answer }));
}

function * dontKnow(db, ws, event) {
  let answer = yield* findAnswer(db, event.hash, event.title)
  if (!answer) answer = yield* createAnswer (db, { hash: event.hash, title: event.title, know: 0, dontKnow: 0 });
  answer.dontKnow++;
  yield saveAnswer(db, answer);
  ws.send(JSON.stringify({ event: 'questionAnswer', hash: event.hash, questionAnswer: answer }));
}

function * findAllAnswers(db, title) {
  return yield db.collection('answers').find({ title }).toArray();
}

function * findAnswer(db, hash, title) {
  return yield db.collection('answers').findOne({ hash, title });
}

function * createAnswer(db, answer) {
  yield db.collection('answers').insertOne(answer);
  return answer;
}

function * saveAnswer(db, answer) {
  yield db.collection('answers').updateOne({ hash: answer.hash, title: answer.title }, answer);
}
