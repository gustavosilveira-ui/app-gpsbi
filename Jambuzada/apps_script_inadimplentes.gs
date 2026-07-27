const FOLDER_ID = '1AkCUCAe9d05dTMJM_9Z9LwtwvvemRran';

function doGet() {
  const files = DriveApp.getFolderById(FOLDER_ID).getFiles();
  const result = [];
  while (files.hasNext()) {
    const file = files.next();
    if (file.getMimeType() !== MimeType.PDF) continue;
    result.push({
      id: file.getId(),
      name: file.getName(),
      url: file.getUrl(),
      updatedAt: file.getLastUpdated().toISOString()
    });
  }
  return ContentService
    .createTextOutput(JSON.stringify({files: result}))
    .setMimeType(ContentService.MimeType.JSON);
}
