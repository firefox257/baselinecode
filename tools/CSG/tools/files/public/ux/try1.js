<!DOCTYPE html>
<html>
<head>
<title>Paste Plain Text</title>
<style>
  #editableDiv {
    border: 1px solid #ccc;
    padding: 10px;
    min-height: 100px;
    margin-top: 20px;
  }
</style>
</head>
<body>

  <h1>Plain Text Paste Example</h1>

  <div id="editableDiv" contenteditable="true">
    Try pasting formatted text here! (e.g., from a Word document or another webpage)
  </div>

  <script>
    // Get the editable div element
    const editableDiv = document.getElementById('editableDiv');

    // Attach the paste event listener
    editableDiv.addEventListener('paste', function(event) {
      // 1. Prevent the default paste behavior
      event.preventDefault();

      // 2. Get the plain text from the clipboard
      // event.clipboardData is a DataTransfer object
      const plainText = event.clipboardData.getData('text/plain');

      // 3. Insert the plain text into the document
      
      // For modern browsers: Use the standard document.execCommand
      if (document.execCommand('insertText', false, plainText)) {
        // execCommand succeeded (most modern browsers)
        return;
      }
      
      // Fallback for older browsers or environments where execCommand is restricted:
      try {
        // Use the Selection API to get the current selection/cursor position
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        
        // Delete any existing selected content
        selection.deleteFromDocument();

        // Create a text node with the plain text
        const textNode = document.createTextNode(plainText);
        
        // Get the current range (cursor/selection position)
        const range = selection.getRangeAt(0);
        
        // Insert the text node at the range's start
        range.insertNode(textNode);
        
        // Move the cursor after the newly inserted text
        range.setStartAfter(textNode);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        
      } catch (error) {
        // A final, less ideal fallback for very restrictive environments
        console.error("Manual text insertion failed. Using contenteditable's textContent method (might lose position):", error);
        document.execCommand('insertText', false, plainText);
      }
    });

  </script>

</body>
</html>
