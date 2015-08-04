import { Evernote } from "evernote";
import { NoteStore } from "evernote-promisified-ts";
import { Config } from "../lib/config";
import { Commander } from "../modules/built/commandline"
import Promise = require("bluebird");

export class App {
  constructor(
    private readNotesMetadata: Evernote.NoteMetadata[],
    private noteStore: NoteStore,
    private config: Config,
    private user: Evernote.User,
    private parsedCommandLine: Commander,
    private sourceNotebooks: Evernote.Notebook[],
    private unfoundNotebookNames: string[],
    private newDigestNotes: Evernote.NoteMetadata[],
    private targetNotebook: Evernote.Notebook) {
  }

  run() {
    this.checkConfig();

    return Promise.all([
      this.copyNewNotes(),
      this.deleteReadDigestNotes()
    ])
  }

  private checkConfig() {
    if (this.unfoundNotebookNames.length > 0) {
      console.warn("Notebook(s) with names " + this.unfoundNotebookNames.join(", ") +
        " were not found.  Verify the spelling and update the values via the command line.")
      this.parsedCommandLine.outputHelp();
    }
  }

  private copyNewNotes() {
    var monotonicTime = 0;
    return Promise.all(this.newDigestNotes.map((m) => {
      return this.noteStore.copyNote(m.guid, this.targetNotebook.guid).then((note) => {
        return this.noteStore.getNote(note.guid, true, false, false, false).then((note) => {
          var modifiedNote = new Evernote.Note({ guid: note.guid, title: note.title });
          var noteLinkUrl = "evernote:///view/" + this.user.id + "/" + this.user.shardId + "/";
          noteLinkUrl += m.guid + "/" + m.guid + "/";
          var noteLinkContent = `<br/><br/>
          <div>
            <a href="${noteLinkUrl}">Original Note</a>
          </div>`
          modifiedNote.content = note.content.replace("</en-note>", noteLinkContent + "</en-note>")
          modifiedNote.attributes = new Evernote.NoteAttributes();
          modifiedNote.attributes.reminderTime = (Math.floor(new Date().getTime() / 1000) - (monotonicTime++)) * 1000;
          return this.noteStore.updateNote(modifiedNote);
        })
      })
    }))
  }

  private deleteReadDigestNotes() {
    return Promise.all(this.readNotesMetadata.map((m) => this.noteStore.expungeNote(m.guid)));
  }
}
