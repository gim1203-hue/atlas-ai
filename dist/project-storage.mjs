export const FILE_CHAR_LIMIT = 2000000;
export const FILE_BYTE_LIMIT = 4000000;
export const PROJECT_BYTE_LIMIT = 100000000;
export const PROJECT_FILE_LIMIT = 1000;

export function createProjectStorage(factory = globalThis.indexedDB) {
  let database;
  async function open() {
    if (!factory) throw Error('Browser project storage is unavailable. Download a ZIP before closing.');
    if (!database) database = new Promise((resolve,reject) => {
      const request = factory.open('atlas-projects-v1',1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('files',{keyPath:'name'});
        request.result.createObjectStore('settings');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {database = null; reject(request.error);};
      request.onblocked = () => {database = null; reject(Error('Close another old Atlas tab to enable project storage.'));};
    });
    return database;
  }
  return {
    async load() {
      const db = await open();
      return new Promise((resolve,reject) => {
        const transaction = db.transaction(['files','settings'],'readonly');
        const files = transaction.objectStore('files').getAll();
        const selected = transaction.objectStore('settings').get('selected');
        transaction.oncomplete = () => resolve({files:files.result,selected:selected.result});
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || Error('Project restore failed.'));
      });
    },
    async save(files,selected) {
      const db = await open();
      return new Promise((resolve,reject) => {
        const transaction = db.transaction(['files','settings'],'readwrite');
        for (const file of files) transaction.objectStore('files').put(file);
        transaction.objectStore('settings').put(selected,'selected');
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || Error('Project save failed.'));
      });
    },
    async remove(names,selected) {
      const db = await open();
      return new Promise((resolve,reject) => {
        const transaction = db.transaction(['files','settings'],'readwrite');
        for (const name of names) transaction.objectStore('files').delete(name);
        transaction.objectStore('settings').put(selected,'selected');
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || Error('Project deletion failed.'));
      });
    },
  };
}
