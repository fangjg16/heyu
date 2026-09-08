import { describe, expect, it } from "vitest";
import { pickerButtonBusy } from "./create-project-picker-busy";

describe("pickerButtonBusy", () => {
  it("does not spin while the OS file dialog is still open", () => {
    expect(pickerButtonBusy(null, false)).toEqual({ file: false, folder: false });
  });

  it("spins the file button after Open until the list updates", () => {
    expect(pickerButtonBusy("file", false)).toEqual({ file: true, folder: false });
  });

  it("spins the folder button after choosing a folder or while reading a drop", () => {
    expect(pickerButtonBusy("folder", false)).toEqual({
      file: false,
      folder: true,
    });
    expect(pickerButtonBusy(null, true)).toEqual({ file: false, folder: true });
  });
});
