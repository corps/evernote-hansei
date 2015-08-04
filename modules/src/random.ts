import pitcher = require("pitcher");
import uuid = require("node-uuid");

export class Module implements pitcher.Module {
  providesUuidGenerator() {
    return () => {
      return uuid.v4().toString();
    }
  }

  providedRand = Math.random;
}
