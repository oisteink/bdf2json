'use strict';

const jf = require('json-font');
const fs = require('fs');

const BDFtokens = { //BDF fields we use - the rest we ignore
    startFont: 'STARTFONT ',
    fontName: 'FONT ',
    fontCharCount: 'CHARS ', //nglyphs - number of chars
    startChar: 'STARTCHAR ', //string - start of glyph data, with name of glyph
    charEncoding: 'ENCODING ', //integer - (charnum) Adobe standard encoding OR -1 possibly followed by non-standard encoding
    dWidth: 'DWIDTH ', //dwx0 dwy0 position of the next glyph’s origin relative to the origin of this glyph.
    bbx: 'BBX ', //BBw BBh BBxoff0x BByoff0y - width of glyphBB, height of glyphBB, offsetX, offsetY are offsets to 0.0 to put the data where it should be in the BB. ' might only have data for top 2 lines and be offset on both x and y. pqjy might start under the BB
    bitmap: 'BITMAP', //Hex bytes representing a line of glyph data, right padded with zero's to fill whole bytes. Examples: A0, B18F, 44C408
    endChar: 'ENDCHAR',
    endFont: 'ENDFONT'
}

/**
 * Custom error to catch unsupported encodings
 */
class bdfUnsupportedEncoding extends Error {
    constructor(glyphName, issue, message) {
        super(message);
        this.glyphName = glyphName;
        this.issue = issue;
    }
}

/**
 * BDF font parser class
 * @extends {jsonFont}
 */
class bdfFontParser extends jf.jsonFont {
    /**
     * Reads a file and returns an array of lines. Handles both CRLF and LF line endings.
     * @param {string} fileName Name of file
     * @returns {string[]} Array of lines
     */
    readFile(fileName) {
        let fileBuffer = fs.readFileSync(fileName);
        let splitter = (fileBuffer.toString().includes('\r\n')) ? '\r\n' : '\n';
        return fileBuffer.toString().split(splitter);
    }

    /**
     * Loads and parses a BDF file populating the instance with data from it
     * @param {string} fileName Name of BDF file
     */
    parseFont(fileName) {
        let lines = this.readFile(fileName);
        while (lines.length > 0) {
            let line = lines.shift(); //Get the top remaining line. Should mabye use nested if's but don't care about speed now. Maybe do a switch on first line in buffer and let subroutines handle the buffer - we'll see
            //Lines *should* be in correct order but we take no chances, and we also skip stuff we don't care about :)
            if (line.includes(BDFtokens.fontName)) { this.fontName = line.substring(BDFtokens.fontName.length, line.length); }
            if (line.includes(BDFtokens.fontCharCount)) { this.charCount = Number(line.substring(BDFtokens.fontCharCount.length, line.length)); }
            if (line.includes(BDFtokens.startChar)) {
                try {
                    let char = new jf.jfChar();
                    char.glyphName = line.substring(BDFtokens.startChar.length, line.length);
                    do {
                        line = lines.shift(); 
                        if (line.includes(BDFtokens.charEncoding)) {
                            char.encoding = Number(line.substring(BDFtokens.charEncoding.length, line.length));
                            if (char.encoding < 0) throw new bdfUnsupportedEncoding(char.glyphName, line.substring(BDFtokens.charEncoding.length, line.length), 'Only standard Adobe encodings supported.');
                        }
                        if (line.includes(BDFtokens.dWidth)) { [char.nextChar] = line.substring(BDFtokens.dWidth.length, line.length).split(' ').map(Number) }
                        if (line.includes(BDFtokens.bbx)) { [char.width, char.height, char.xOffset, char.yOffset] = line.substring(BDFtokens.bbx.length, line.length).split(' ').map(Number) }
                        if (line.includes(BDFtokens.bitmap)) {
                            line = lines.shift(); //get data -if any. If no data (empty glyph) we will move on.
                            while (!line.includes(BDFtokens.endChar)) {
                                let hex = Number('0x' + line);
                                let bitWidth = (char.width < 9) ? 8 : 16;
                                let bitLine = [];
                                for (let bit = bitWidth; bit >= (bitWidth - char.width); bit--) {
                                    bitLine.push((hex >> bit) & 0x01);
                                }
                                char.glyph.push(bitLine);
                                line = lines.shift();
                            }
                        }
                    } while (!line.includes(BDFtokens.endChar))
                    this.chars.push(char); //Add the character
                    console.log('Done ', this.chars.length, ' chars of ', this.charCount, ' : ', Number((this.chars.length / this.charCount)*100).toFixed(2), '%');
                }
                catch (error) {
                    if (error instanceof bdfUnsupportedEncoding) {
                        console.warn(error.glyphName, error.issue, error.message);
                    } else {
                        throw error; //Re-throw other errors
                    }
                }
            }
        }
    }
}

console.time('Time spent converting');
let outfile, infile;
{
    let myArgs = process.argv.slice(2);
    if (myArgs.length = 4) {
        infile = myArgs[myArgs.indexOf('-i') + 1];
        outfile = myArgs[myArgs.indexOf('-o') + 1];
    }
    if ((!infile) | (!outfile)) {
        console.log('usage: -o outfile -i infile')
        process.exit(-1);
    }
}

console.log('Converting ', infile, ' to ', outfile );
let font = new bdfFontParser();
font.parseFont(infile);
fs.writeFileSync(outfile, JSON.stringify(font));
console.timeEnd('Time spent converting');
