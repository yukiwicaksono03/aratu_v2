let connection;
function database() {
  return connection ||= new Promise((resolve, reject) => {
    const req = indexedDB.open('aratu-studio', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('projects', { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { connection = null; reject(req.error); };
  });
}
async function operation(mode, action) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('projects', mode);
    const request = action(tx.objectStore('projects'));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Penyimpanan dibatalkan'));
  });
}
export const saveProject = project => operation('readwrite', store => store.put(project));
export const listProjects = () => operation('readonly', store => store.getAll());
export const deleteProject = id => operation('readwrite', store => store.delete(id));
