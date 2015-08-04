import pitcher = require("pitcher");
import { Evernote } from "evernote";
import Promise = require("bluebird");
import config = require("./config");
import { Config } from "../../lib/config";
import random = require("./random");
import en = require("evernote-promisified-ts");
import commandline = require("./commandline");

export class Module implements pitcher.Module {
  includes = [config.Module, random.Module];

  providedIsSandbox = false;
  providedPromiseEngine = Promise;

  providesDigestSize(config: Config) {
    return config.digestSize;
  }

  providesClient(
    config: Config,
    isSandbox: boolean,
    parsedCommandLine: typeof commandline._commander,
    promiseEngine: en.PromiseEngine
  ) {
    if (!config.authToken) {
      parsedCommandLine.outputHelp();
      throw new Error("Authentication token was not set, set one and rerun.");
    }
    en.setPromiseEngine(promiseEngine);
    return new Evernote.Client({ token: config.authToken, sandbox: isSandbox });
  }

  providesUserStore(client: Evernote.Client) {
    return en.promisifyUserStore(client.getUserStore());
  }

  providesNoteStore(client: Evernote.Client) {
    return en.promisifyNoteStore(client.getNoteStore());
  }

  providesUser(userStore: en.UserStore) {
    return pitcher.promised(userStore.getUser());
  }

  providesDefaultTargetNotebook(uuidGenerator: () => string) {
    var newNb = new Evernote.Notebook();
    newNb.guid = uuidGenerator();
    newNb.name = "Hansei";
    return newNb;
  }

  providesNotebooksList(noteStore: en.NoteStore) {
    return pitcher.promised(noteStore.listNotebooks());
  }

  providesUnreadDigestFilter(targetNotebook: Evernote.Notebook) {
    var result = new Evernote.NoteFilter();
    result.notebookGuid = targetNotebook.guid;
    result.words = "-reminderDoneTime:*";
    return result;
  }

  providesReadDigestFilter(targetNotebook: Evernote.Notebook) {
    var result = new Evernote.NoteFilter();
    result.notebookGuid = targetNotebook.guid;
    result.words = "reminderDoneTime:*";
    return result;
  }

  providesUnreadNoteCount(
    noteStore: en.NoteStore,
    targetNotebook: Evernote.Notebook,
    unreadDigestFilter: Evernote.NoteFilter) {
    return pitcher.promised(noteStore.findNoteCounts(unreadDigestFilter, false).then((counts) => {
      if (counts.notebookCounts == null) return 0;
      return counts.notebookCounts[targetNotebook.guid] || 0;
    }))
  }

  providesReadNotesMetadata(
    noteStore: en.NoteStore,
    readDigestFilter: Evernote.NoteFilter) {
    var resultSpec = new Evernote.NotesMetadataResultSpec();
    return pitcher.promised(noteStore.findNotesMetadata(readDigestFilter, 0, 100, resultSpec).then((metaList) => {
      return metaList.notes;
    }));
  }

  providesRandomNoteFinder = pitcher.factory((
    noteStore: en.NoteStore,
    sourceNotebooks: Evernote.Notebook[],
    rand: () => number) => {

    var retries = 0;
    var findANote = (): Promise<Evernote.NoteMetadata> => {
      if (retries++ > 3) {
        return Promise.reject(new Error(
          "Could not find a source note after 3 tries. Make sure your source notebooks are not empty."));
      }
      var notebook = sourceNotebooks[Math.floor(rand() * sourceNotebooks.length)];
      var filter = new Evernote.NoteFilter({ notebookGuid: notebook.guid });
      return Promise.cast(noteStore.findNoteCounts(filter, false).then((counts) => {
        var count = counts.notebookCounts[notebook.guid] || 0;
        var offset = Math.floor(rand() * count);
        return noteStore.findNotesMetadata(filter, offset, 1, new Evernote.NotesMetadataResultSpec());
      }).then((metaList) => {
        if (metaList.notes.length == 0) {
          return findANote();
        }
        return Promise.resolve(metaList.notes[0]);
      }));
    }

    return findANote();
  });

  providesNewDigestNotes(
    noteStore: en.NoteStore,
    randomNoteFinder: () => Promise<Evernote.NoteMetadata>,
    digestSize: number,
    unreadNoteCount: number) {

    var notesToAdd = Math.max(digestSize - unreadNoteCount, 0);
    var retries = 0;
    var result: Evernote.NoteMetadata[] = [];
    var seenGuids: { [k: string]: boolean } = {};
    var findNotes = (): Promise<Evernote.NoteMetadata[]> => {
      if (retries++ >= 5 * digestSize || notesToAdd <= 0) {
        return Promise.resolve(result);
      }

      return randomNoteFinder().then((next) => {
        if (seenGuids[next.guid]) return findNotes();
        seenGuids[next.guid] = true;
        notesToAdd--;
        result.push(next);
        return findNotes();
      })
    }

    return pitcher.promised(findNotes());
  }

  providesUnfoundNotebookNames(
    sourceNotebooks: Evernote.Notebook[],
    config: Config
  ) {
    var resultingNames = sourceNotebooks.map(n => n.name);
    return config.notebookNames.filter((n) => resultingNames.indexOf(n) == -1)
  }

  providesSourceNotebooks(
    notebooksList: Evernote.Notebook[],
    parsedCommandLine: typeof commandline._commander,
    config: Config) {

    if (config.notebookNames.length == 0) {
      parsedCommandLine.outputHelp();
      throw new Error("Could not find a valid source notebook.")
    }

    return notebooksList.filter((n) => config.notebookNames.indexOf(n.name) != -1);
  }

  providesTargetNotebook(
    noteStore: en.NoteStore,
    notebooksList: Evernote.Notebook[],
    defaultTargetNotebook: Evernote.Notebook,
    config: Config) {

    var findExistingNotebook: Promise<Evernote.Notebook>;
    var searchByName = () => {
      var existing = notebooksList.filter((n) => n.name == defaultTargetNotebook.name)[0];
      return Promise.resolve(existing);
    }

    if (config.targetNotebookGuid) {
      findExistingNotebook = Promise.cast(noteStore.getNotebook(config.targetNotebookGuid).catch(searchByName));
    } else {
      findExistingNotebook = searchByName();
    }

    return pitcher.promised(findExistingNotebook.catch((err) => {
      var isNotFound = err instanceof Evernote.EDAMNotFoundException;
      var isBadUuid = !isNotFound
        && err instanceof Evernote.EDAMUserException
        && err.errorCode == Evernote.EDAMErrorCode.DATA_REQUIRED;
      if (!isNotFound && !isBadUuid) {
        throw err;
      }

      return <Evernote.Notebook>null;
    })).then((nb) => {
      if (!nb)
        return noteStore.createNotebook(defaultTargetNotebook);
      else
        return nb
    }).then((nb) => {
      config.targetNotebookGuid = nb.guid;
      return config.save().then(() => nb);
    });
  }
}
