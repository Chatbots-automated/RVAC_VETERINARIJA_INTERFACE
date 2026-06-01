# Lithuanian Font Support for PDF Export - Instructions

## Problem
The PDF exports were showing spaced characters (e.g., "Ū k i s :" instead of "Ūkis:") because the font wasn't properly converted with glyph widths and Unicode mapping.

## Solution
Use the official jsPDF fontconverter to properly convert Roboto font.

## Steps to Fix:

### 1. Open the Font Converter
Open the file `fontconverter.html` (located in project root) in your web browser.

**Alternative:** Use the online converter at:
https://peckconsulting.s3.amazonaws.com/fontconverter/fontconverter.html

### 2. Convert the Font
1. Click "Choose Files" button
2. Select `Roboto-Regular.ttf` (also in project root)
3. The form will auto-fill with:
   - Font Name: `Roboto-Regular`
   - Font Style: `normal`
4. **IMPORTANT:** Choose Module format: `ES modules`
5. Click "Create" button
6. Download the generated `Roboto-Regular-normal.js` file

### 3. Install the Font
1. Move the downloaded `Roboto-Regular-normal.js` file to:
   ```
   src/assets/fonts/Roboto-Regular-normal.js
   ```

### 4. Update the Code
The file `src/components/FarmDetailAnalytics.tsx` needs to be updated to import and use the properly converted font.

Replace the import section with:
```typescript
import RobotoFont from '../assets/fonts/Roboto-Regular-normal';
```

In the `handleExportPDF` function, add this BEFORE creating the PDF:
```typescript
// Initialize the font (this registers it with jsPDF)
RobotoFont(jsPDF.API);
```

Then use the font normally:
```typescript
const doc = new jsPDF('p', 'mm', 'a4');
doc.setFont('Roboto-Regular', 'normal');
```

### 5. Remove toAscii() calls
Once the font is properly working, you can remove all `toAscii()` function calls and display Lithuanian characters directly.

## Files Provided:
- ✅ `Roboto-Regular.ttf` - Source font file (ready to convert)
- ✅ `fontconverter.html` - Official jsPDF font converter tool

## Expected Result:
After proper conversion, Lithuanian text will display correctly:
- "Ūkis:" (not "Ū k i s :")
- "Įmonės kodas" (not "I m o n s  k o d a s")
- "Tarpinė suma" (not "T a r p i n  s u m a")
