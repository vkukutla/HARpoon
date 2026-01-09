// Web worker to convert HAR file to JSON string
self.onmessage = function(e) {
  const { fileText } = e.data;
  
  try {
    // Parse and validate it's valid JSON
    const jsonData = JSON.parse(fileText);
    
    // Stringify it back to get a clean JSON string
    const jsonString = JSON.stringify(jsonData, null, 2);
    
    // Send the result back to the main thread
    self.postMessage({ 
      success: true, 
      jsonString 
    });
  } catch (error) {
    // Send error back to main thread
    self.postMessage({ 
      success: false, 
      error: error.message 
    });
  }
};

