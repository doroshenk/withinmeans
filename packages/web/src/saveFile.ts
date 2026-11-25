/** Hands the viewer a JSON file to save, through a temporary link. */
export function saveFile(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // Later, not now: some browsers start the download after the click returns.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
