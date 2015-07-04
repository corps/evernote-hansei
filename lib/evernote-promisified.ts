import Promise = require("bluebird");
import { Evernote } from "evernote";

function evernoteDeferred<R>() {
  var deferred = Promise.defer<R>();
  return {
    cb: (err: any, r: R) => {
      if (err) {
        deferred.reject(err);
      } else {
        deferred.resolve(r);
      }
    },
    promise: deferred.promise
  };
}

function promisify0<R>(f: (cb: Evernote.Callback<R>) => void) {
  return () => {
    var deferred = evernoteDeferred<R>();
    f(deferred.cb);
    return deferred.promise;
  }
}

function promisify1<R, A1>(f: (a1: A1, cb: Evernote.Callback<R>) => void) {
  return (a1: A1) => {
    var deferred = evernoteDeferred<R>();
    f(a1, deferred.cb);
    return deferred.promise;
  }
}

function promisify2<R, A1, A2>(f: (a1: A1, a2: A2, cb: Evernote.Callback<R>) => void) {
  return (a1: A1, a2: A2) => {
    var deferred = evernoteDeferred<R>();
    f(a1, a2, deferred.cb);
    return deferred.promise;
  }
}

function promisify3<R, A1, A2, A3>(f: (a1: A1, a2: A2, a3: A3, cb: Evernote.Callback<R>) => void) {
  return (a1: A1, a2: A2, a3: A3) => {
    var deferred = evernoteDeferred<R>();
    f(a1, a2, a3, deferred.cb);
    return deferred.promise;
  }
}

function promisify4<R, A1, A2, A3, A4>(f: (a1: A1, a2: A2, a3: A3, a4: A4, cb: Evernote.Callback<R>) => void) {
  return (a1: A1, a2: A2, a3: A3, a4: A4) => {
    var deferred = evernoteDeferred<R>();
    f(a1, a2, a3, a4, deferred.cb);
    return deferred.promise;
  }
}

export function promisifyUserStore(userStore: Evernote.UserStoreClient) {
  return {
    getUser: promisify0(userStore.getUser)
  };
}

var userStore = promisifyUserStore(<any>{});
export type UserStore = typeof userStore;


export function promisifyNoteStore(noteStore: Evernote.NoteStoreClient) {
  return {
    getNotebook: promisify1(noteStore.getNotebook),
    listNotebooks: promisify0(noteStore.listNotebooks),
    createNotebook: promisify1(noteStore.createNotebook),
    findNoteCounts: promisify2(noteStore.findNoteCounts),
    findNotesMetadata: promisify4(noteStore.findNotesMetadata),
    expungeNote: promisify1(noteStore.expungeNote),
    copyNote: promisify2(noteStore.copyNote),
    updateNote: promisify1(noteStore.updateNote)
  };
}

var noteStore = promisifyNoteStore(<any>{});
export type NoteStore = typeof noteStore;
