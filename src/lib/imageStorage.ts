// IndexedDB storage for user-uploaded scene images
// Persists images across sessions

const DB_NAME = 'FilmMagixDB';
const DB_VERSION = 1;
const STORE_NAME = 'sceneImages';

/**
 * Initialize IndexedDB
 */
function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => {
      console.error('[STORAGE] Failed to open IndexedDB');
      reject(new Error('Failed to open database'));
    };
    
    request.onsuccess = () => {
      console.log('[STORAGE] IndexedDB opened successfully');
      resolve(request.result);
    };
    
    request.onupgradeneeded = (event) => {
      console.log('[STORAGE] Creating IndexedDB schema');
      const db = (event.target as IDBOpenDBRequest).result;
      
      // Create object store for scene images
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        console.log('[STORAGE] Created sceneImages store');
      }
    };
  });
}

/**
 * Store image in IndexedDB
 */
export async function storeSceneImage(
  sceneId: string,
  imageData: string, // base64
  metadata?: {
    filename?: string;
    size?: number;
    width?: number;
    height?: number;
  }
): Promise<void> {
  try {
    const db = await initDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    const record = {
      id: sceneId,
      imageData,
      timestamp: Date.now(),
      ...metadata
    };
    
    const request = store.put(record);
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        console.log(`[STORAGE] Stored image for scene: ${sceneId}`);
        resolve();
      };
      
      request.onerror = () => {
        console.error(`[STORAGE] Failed to store image for scene: ${sceneId}`);
        reject(new Error('Failed to store image'));
      };
      
      transaction.oncomplete = () => {
        db.close();
      };
    });
    
  } catch (error) {
    console.error('[STORAGE] Error storing image:', error);
    throw error;
  }
}

/**
 * Retrieve image from IndexedDB
 */
export async function getSceneImage(sceneId: string): Promise<string | null> {
  try {
    const db = await initDB();
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(sceneId);
    
    return new Promise((resolve) => {
      request.onsuccess = () => {
        const record = request.result;
        if (record?.imageData) {
          console.log(`[STORAGE] Retrieved image for scene: ${sceneId}`);
          resolve(record.imageData);
        } else {
          resolve(null);
        }
      };
      
      request.onerror = () => {
        console.error(`[STORAGE] Failed to retrieve image for scene: ${sceneId}`);
        resolve(null);
      };
      
      transaction.oncomplete = () => {
        db.close();
      };
    });
    
  } catch (error) {
    console.error('[STORAGE] Error retrieving image:', error);
    return null;
  }
}

/**
 * Delete image from IndexedDB
 */
export async function deleteSceneImage(sceneId: string): Promise<void> {
  try {
    const db = await initDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(sceneId);
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        console.log(`[STORAGE] Deleted image for scene: ${sceneId}`);
        resolve();
      };
      
      request.onerror = () => {
        console.error(`[STORAGE] Failed to delete image for scene: ${sceneId}`);
        reject(new Error('Failed to delete image'));
      };
      
      transaction.oncomplete = () => {
        db.close();
      };
    });
    
  } catch (error) {
    console.error('[STORAGE] Error deleting image:', error);
    throw error;
  }
}

/**
 * Clear all stored images
 */
export async function clearAllImages(): Promise<void> {
  try {
    const db = await initDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        console.log('[STORAGE] Cleared all stored images');
        resolve();
      };
      
      request.onerror = () => {
        console.error('[STORAGE] Failed to clear images');
        reject(new Error('Failed to clear images'));
      };
      
      transaction.oncomplete = () => {
        db.close();
      };
    });
    
  } catch (error) {
    console.error('[STORAGE] Error clearing images:', error);
    throw error;
  }
}

/**
 * Get all stored scene IDs
 */
export async function getStoredSceneIds(): Promise<string[]> {
  try {
    const db = await initDB();
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAllKeys();
    
    return new Promise((resolve) => {
      request.onsuccess = () => {
        const ids = request.result as string[];
        console.log(`[STORAGE] Found ${ids.length} stored images`);
        resolve(ids);
      };
      
      request.onerror = () => {
        console.error('[STORAGE] Failed to get stored IDs');
        resolve([]);
      };
      
      transaction.oncomplete = () => {
        db.close();
      };
    });
    
  } catch (error) {
    console.error('[STORAGE] Error getting stored IDs:', error);
    return [];
  }
}