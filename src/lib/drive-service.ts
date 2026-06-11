export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
}

/**
 * Lists backup files in Google Drive containing 'grocery_catalog_backup' or 'regular_items'.
 */
export async function listBackupFiles(token: string): Promise<DriveFile[]> {
  const query = "name contains 'grocery_catalog_backup' or name contains 'regular_items' and trashed = false";
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    query
  )}&fields=files(id,name,mimeType,modifiedTime,size)&orderBy=modifiedTime desc`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to list Google Drive files: ${response.statusText} (${errorText})`);
  }

  const data = await response.json();
  return data.files || [];
}

/**
 * Downloads the raw content of a specific Drive file.
 */
export async function downloadFileContent(token: string, fileId: string): Promise<string> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to download Drive file content: ${response.statusText} (${errorText})`);
  }

  return response.text();
}

/**
 * Uploads a text/JSON/CSV file using the robust two-step protocol.
 * If file already exists with this name, updates the existing file.
 */
export async function uploadBackupFile(
  token: string,
  filename: string,
  mimeType: string,
  content: string
): Promise<DriveFile> {
  // 1. Search for existing file with the exact name
  const query = `name = '${filename.replace(/'/g, "\\'")}' and trashed = false`;
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;
  
  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  let fileId = "";
  if (searchRes.ok) {
    const searchData = await searchRes.json();
    if (searchData.files && searchData.files.length > 0) {
      fileId = searchData.files[0].id;
    }
  }

  if (fileId) {
    // 2a. Update existing file content
    const uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
    const updateRes = await fetch(uploadUrl, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": mimeType,
      },
      body: content,
    });

    if (!updateRes.ok) {
      const err = await updateRes.text();
      throw new Error(`Failed to update Drive file content: ${err}`);
    }

    // Touch modified time
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        modifiedTime: new Date().toISOString(),
      }),
    });

    return { id: fileId, name: filename, mimeType, modifiedTime: new Date().toISOString() };
  } else {
    // 2b. Create new file metadata
    const createMetaRes = await fetch("https://www.googleapis.com/drive/v3/files", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: filename,
        mimeType: mimeType,
      }),
    });

    if (!createMetaRes.ok) {
      const err = await createMetaRes.text();
      throw new Error(`Failed to create metadata on Drive: ${err}`);
    }

    const newMetadata = await createMetaRes.json();
    const newFileId = newMetadata.id;

    // Upload content to the newly created file ID
    const uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${newFileId}?uploadType=media`;
    const uploadRes = await fetch(uploadUrl, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": mimeType,
      },
      body: content,
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      throw new Error(`Failed to upload chunk content: ${err}`);
    }

    return { id: newFileId, name: filename, mimeType, modifiedTime: new Date().toISOString() };
  }
}
