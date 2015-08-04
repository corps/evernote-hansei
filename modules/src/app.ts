import pitcher = require("pitcher");
import evernote = require("./evernote");
import { App } from "../../lib/app";

export class Module implements pitcher.Module {
  includes = [evernote.Module];
  providesApp = App;
}
