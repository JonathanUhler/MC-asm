// assembler.js
//
// A simple assembler for the Minecraft Computer. Takes a text file written in
// the assembly language and outputs an array of 0's and 1's representing where
// redstone torches must go in the program memory

"use strict"

const { match } = require('assert')

const AssemblerVersion = "3.3.0"

// Revision History
//
//  version    date                     Change
// -------  ----------  -------------------------------------------------------
// 3.3.0	11/22/2020	Chanes in this version:
//							-Added the printAndParseLabels function to handle labels
//							-Print labels at the top of the output
//
// 3.3.1	11/23/2020	Add license

// +=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+
// MIT License
//
// Copyright (c) 2020 Jonathan Uhler and Mike Uhler
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
// +=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+


// ============================================================================
// Unix commands
//
// help [--cmd <command>]:		prints info about the commands or about a specific
//								command specified with the argument
//
// run:							runs the program
//
// directory <-i/-o> [path]:	change the directory for the input or output file
//								if the "path" argument is given or print the
//								current directory if no "path" is given
//
// clear <-i/-o>:				clears one of the files specified by the "i/o" argument
//
// debug <on/off>:				toggles the debug messages
//
// timeout <value>:				updates the timeout value (how long the program can run
//								before automatically teminating)
// ============================================================================


// Version information
this.Version = AssemblerVersion
AssemblerMessage("Assembler v" + this.Version)


// ============================================================================
// AssemblerMessage
//
// Function to emit a message, with optional arguments, which are separated
// by ", "
//
// Arguments--
//
// msg:        Message
//
// args:       Optional list of arguments to output
//
// Returns--
//
// None
//
function AssemblerMessage(msg, ...args) {

	const AssemblerMessageEnable = true

    let message = "A-MSG:	" + msg
    if (args.length > 0) {
      	message += " " + args.join(", ")
    }

	if (AssemblerMessageEnable) {
		console.log(message)
	}

} // end: function AssemblerMessage


// ============================================================================
// printParsedLine
//
// Print the information returned from parseLine as an example of how to use
// the information
//
// Arguments--
//
// line:		the literal line, as passed in to the assembler (written in
//				assembly code)
//
// matchStr:	parsed line to print (this is the hash returned by lineParse)
//
function printParsedLine(line, matchStr) {
	if (matchStr === undefined) {
	  	AssemblerMessage(`Parse error found on line \"${line}\"`)
	  	return
	}
	AssemblerMessage(`	Parsed line is \"${line}\"`)
	AssemblerMessage(`	label: \"${matchStr.label}\", opcode: \"${matchStr.opcode}\", argCount: ${matchStr.argCount}`)
	for (let i = 0; i < matchStr.argCount; i++) {
	  	AssemblerMessage(`		Argument ${i}: \"${matchStr.args[i]}\"`)
	}
} // end: function printParsedLine


// ============================================================================
// writeDataToFile
//
// Takes a given directory and some data and writes it to the file given.
//
// Arguments--
//
// directory:		The location of the file to write the data to on the
//					current machine
//
// dataToWrite:		The data to be written to the specified file
//
// Returns--
//
// None
//
function writeDataToFile(directory, dataToWrite) {
	var fs = require("fs")

	fs.appendFile(directory, dataToWrite, (err) => {
		if (err) {
			throw err
		}
		else {
			AssemblerMessage(`Output file at \"${directory}\" written with data:	${dataToWrite}`)
		}
	})
} // end: function writeDataToFile


// ============================================================================
// GLOBAL VARIABLES
//
// The current real line number of the program counter (not included commented
// lines or blank-space lines)
let pc = -1
// An object used to index the value of the pc using a label
let labelHash = {}
// Array of all the built instructions
let instructionArray = []
// The locations of the input and output text files (edit from here for easy
// access)
const inputDirectory = '/Users/jonathan/Documents/VS Code/Assembler/input.asm'
const outputDirectory = '/Users/jonathan/Documents/VS Code/Assembler/output.bin'
const maxTimeoutValue = 500
//
// end: GLOBAL VARIABLES


// Set up timestamp information to print to the output file as a comment
let today = new Date()
let date = (today.getMonth() + 1) + '-' + (today.getDate()) + '-' + today.getFullYear()
let time = today.getHours() + ":" + today.getMinutes() + ":" + today.getSeconds()
let dateTime = date + ' ' + time

writeDataToFile(outputDirectory, "\n// assembler.js v" + AssemblerVersion + "\n" + "// " + dateTime + "\n")


// ============================================================================
// Instruction field descriptors
//
// Each field is indexed by the name of the field and is a hash that describes
// the type of field and the allowable values. Keys to that hash are:
//
// isOpcode    True if the field is an opcode
//
// isLabel     True if the field is a branch label
//
// startsAt    Right-most bit of the field. This is also the amount to left
//             shift a right-justified value to position it to the field.
//
// mask        The mask with which to AND a right-justified value to ensure
//             that it fits in the field
//
// pattern     The RegEx pattern to use to match a valid value in that field
//
// minVal      The minimum allowable value for the field
//
// maxVal      The maximum allowable value for the field
//
const instructionFields = {
	// Opcode: minVal and maxVal aren't used.
	"opcode"  : {isOpcode: true,  isLabel: false, isImm: false, startsAt: 20,  mask: 0x1f, pattern : /^(\w+)$/,            minVal: 0, maxVal: 0},
	// The four register fields. Valid register numbers are 0 to 15
	"rw"      : {isOpcode: false, isLabel: false, isImm: false, startsAt: 16,  mask: 0xf,  pattern : /^r(\d+)$/,           minVal: 0, maxVal: 15},
	"ra"      : {isOpcode: false, isLabel: false, isImm: false, startsAt: 12,  mask: 0xf,  pattern : /^r(\d+)$/,           minVal: 0, maxVal: 15},
	"rb"      : {isOpcode: false, isLabel: false, isImm: false, startsAt:  8,  mask: 0xf,  pattern : /^r(\d+)$/,           minVal: 0, maxVal: 15},
	// The immediate field. It's an 8-bit field, so the valid numbers are 0 to 255, but the
	// value can be specified as hex, e.g., 0x... or decimal
	"imm"     : {isOpcode: false, isLabel: false, isImm: true,  startsAt:  0,  mask: 0xff, pattern: /^(0x[0-9a-f]+|\d+)$/, minVal: 0, maxVal: 255},
	// Lable for branch instructions. minVal and maxVal aren't used.
	"label"   : {isOpcode: false, isLabel: true, isImm: false,  startsAt:  0,  mask: 0xff, pattern: /^(\w+)$/,             minVal: 0, maxVal: 0}
} // end: hash intructionFields

// Instruction Validation table
//                                     Opcode Map
//                                    Instn<22:20>
//                  000    001   010   011   100   101   110   111
//                 +-----+-----+-----+-----+-----+-----+-----+-----+
//               00| or  | and |     | not | cmp |     | add | sub |
//                 +-----+-----+-----+-----+-----+-----+-----+-----+
//               01| ori | andi|     | noti| cmpi|     | addi| subi|
// Instn<23:33>    +-----+-----+-----+-----+-----+-----+-----+-----+
//               10| brz | bro |     |     |     |     |     |     |
//                 +-----+-----+-----+-----+-----+-----+-----+-----+
//               11| ld  | st  |     |     |     |     | halt| mf  |
//                 +-----+-----+-----+-----+-----+-----+-----+-----+
const instructionValidationTable = {
	// First row of opcode table
	"or"  :  {opcode:  0, argCount: 3, args:["rw","ra","rb"]},
	"and" :  {opcode:  1, argCount: 3, args:["rw","ra","rb"]},
	"not" :  {opcode:  3, argCount: 2, args:["rw","rb"]},
	"cmp" :  {opcode:  4, argCount: 3, args:["rw","ra","rb"]},
	"add" :  {opcode:  6, argCount: 3, args:["rw","ra","rb"]},
	"sub" :  {opcode:  7, argCount: 3, args:["rw","ra","rb"]},
	// Second row of opcode table
	"ori"  : {opcode:  8, argCount: 3, args:["rw","ra","imm"]},
	"andi" : {opcode:  9, argCount: 3, args:["rw","ra","imm"]},
	"noti" : {opcode: 11, argCount: 2, args:["rw","imm"]},
	"cmpi" : {opcode: 12, argCount: 3, args:["rw","ra","imm"]},
	"addi" : {opcode: 14, argCount: 3, args:["rw","ra","imm"]},
	"subi" : {opcode: 15, argCount: 3, args:["rw","ra","imm"]},
	// Third row of opcode table
	"brz" :  {opcode: 16, argCount: 2, args:["rb","label"]},
	"bro" :  {opcode: 17, argCount: 2, args:["rb","label"]},
	"mf" :   {opcode: 31, argCount: 3, args:["rw","ra","imm"]},
	// Fourth row of opcode table
	"ld" :   {opcode: 24, argCount: 3, args:["rw","ra","imm"]},
	"st" :   {opcode: 25, argCount: 3, args:["rw","ra","imm"]},
	"halt" : {opcode: 30, argCount: 1, args:["imm"]},
	
	// pseudo instructions that provide more intuitive access to certain instructions
	"nop" :  {opcode:  0, argCount: 0, args:[]},
	"li"  :  {opcode:  8, argCount: 2, args:["rw","imm"]},
	"br"  :  {opcode: 16, argCount: 1, args:["label"]},
} // end: hash instructionValidationTable


// ============================================================================
// replaceStringInData
//
// Function to search through all lines of a file for specific characters or
// phrases (primarily used to remove lines with comments "//")
//
// Arguments--
//
// directory:		The local path to the input file
//
// search:			The string to search for in the file
//
// replace:			The string to replace the "search" string with if and when
//					it is found
//
// Returns--
//
// returnData:		The full string of all the appended lines (after replacing
//					terms and trimming the lines)
//
function replaceStringInData(directory, search, replace) {

	const fs = require('fs')

	let searchContent = search
	let replaceContent = replace


	let data = fs.readFileSync(directory)

	let fileData = data.toString() // Save the file data as a string
	let fileLinesArray = fileData.split("\n") // Split the file into individual lines as an array
	AssemblerMessage("File lines:", fileLinesArray)

	let returnData = [] // Declare the returnData array to be used later

	for (let i = 0; i < fileLinesArray.length; i++) { // Repeat for every line of the file

		// Save each individual line to the temporary fileLine variable
		// then replace the desired character(s) and trim any white space
		// from the start and end of the line
		let fileLine = fileLinesArray[i].replace(searchContent, replaceContent)
		fileLine = fileLine.trim()
		fileLine = fileLine.toLowerCase()

		// Save each of the appended lines to a new array
		if (fileLine.length !== 0) {
			returnData.push(fileLine)
		}

		// Print the line to console
		AssemblerMessage("Line " + i + " Data:	" + fileLine)
	}

	// Return the edited array of lines
	AssemblerMessage("Replace string in data return:	", returnData)
	return returnData
	
} // end: function replaceStringInData



// Take the edited lines from replaceStringInData and compile them
let lines = replaceStringInData(inputDirectory, /\/\/.*$/, "")


// For each line, search for a label, and if one is found then add it to the file
for (let i = 0; i < lines.length; i++) {

	pc++
	let line = lines[i]
	let matchStr = lineParse(line) // lineParse returns some info about the line -- label, opcode, argCount, args

	AssemblerMessage(`Searching for labels on line \"${line}\" with pc 0x${pc.toString(16).padStart(2, "0")}`)

	// Put the labels at the top of the output
	printAndParseLabels(matchStr.label, pc.toString(16))
}

pc = -1

// For each line, parse and build the 
// This is where the actual assembly code is processed
for (let i = 0; i < lines.length; i++) { // "lines" is the array of all the lines from the input file

	pc++

	// Display and use the contents and length of each line
	// Message should look like this 'Line: x has length: y, and states: "z"'
	AssemblerMessage("Line: " + i, "has length " + lines[i].length, "and states \"" + lines[i] + "\"")

	// If the timeout limit is exceeded, break out of the loop and terminate the program
	if (i > maxTimeoutValue) {
		AssemblerMessage(`ERROR maxTimeoutValue exceeded! Program terminated at line ${i}. This can be changed by using the \"timeout <value>\" command (use \"help [--cmd <command>] for help\")`)
		instructionArray.push(`// ERROR maxTimeoutValue exceeded! Program terminated at line ${i}. This can be changed by using the \"timeout <value>\" command (use \"help [--cmd <command>]\" for help)`)
		break
	}

	// For each line of the assembly code, parse and print it
	let line = lines[i] // "line" is the placeholder for the single line currently being processed
	let matchStr = lineParse(line) // lineParse returns some info about the line -- label, opcode, argCount, args
	// Print the parsed line to console
	printParsedLine(line, matchStr) // printParsedLine does NOT alter data, it is only for debug and just prints the data to console
	// Build the rest of the instructions
	let buildResult = buildInstruction(matchStr)
  	if (!buildResult.result) {
    	AssemblerMessage(`Unable to build instruction for ${line}: ${buildResult.message}`)
	} 
	else {
		// If the build was successful, print the completed line to the output file
		instructionArray.push(`0x${(pc).toString(16).padStart(2, "0")}: 0x${buildResult.instruction.toString(16).padStart(7, "0")}`) // writeDataToFile(outputDirectory, `0x${pc.toString(16)}: 0x${buildResult.instruction.toString(16).padStart(7, "0")}\n`)
		// ...and print the built line to the console for easier debug
    	AssemblerMessage(`	Assembled instruction for ${line} was 0x${buildResult.instruction.toString(16).padStart(7, "0")}, with branch target \"${buildResult.brTarget}\"; immediate was hex: ${buildResult.immWasHex}`)
  	}

}

// Write all the data to the file
let writeBuiltInstructions = instructionArray.join("\n")
writeDataToFile(outputDirectory, writeBuiltInstructions)



// ============================================================================
// handleBranchAndLabel
//
// Goes through the entire input file, looks for any branches and takes note of
// the PC positions of those branches, then labels are printed (.label <lblname>
// <lblPCinhex>) to the top of the file and branches are built
//
// Arguments--
//
// label:		the label that was found on the line (note this could just be ""
//				so there is a check to make sure it is a valid label)
//
// pcValue:		the value of the pc
//
function printAndParseLabels(label, pcValue) {

	if (label.length > 0) {
		AssemblerMessage(`Label \"${label}\" found on line 0x${pcValue.padStart(2, "0")}`)
		instructionArray.push(`.label ${label} 0x${pcValue.padStart(2, "0")}`)
	}

} // end: function printAndParseLabels


// ============================================================================
// buildInstruction
//
// Take the results of lineParse and build an instruction from the text.
//
// Arguments--
//
// parsedValue:		The return value from parseLine
//
// Returns--
//
// A hash with the results of the attempt to build the instruction, with the
// following keys:
//
// result:        (Boolean) The result of the function. If true, the value
//                of the instruction is in the instruction key. If false, something
//                went wrong, and the error message is in the message key
//
// instruction:   (Integer) The value of the assembled instruction
//
// brTarget:      (String) If the instruction is a branch, this is the
//                symbolic branch target. "" if not a branch
//
// immWasHex:     (Boolean) True if the immediate field was a hex value
//
// message:       (String) The error message if the assembly failed
//
function buildInstruction(parsedValue) {
	var instruction = 0
	var errorMessage = ""
  
	let iValEntry = instructionValidationTable[parsedValue.opcode]
	// Get the instruction validation entry based on the opcode. If this comes
	// back undefined, then it was an invalid instruction
	if (iValEntry === undefined) {
		errorMessage = "Opcode not recogignized: " + parsedValue.opcode
		return { result: false, instruction: 0, brTarget: "", immWasHex: false, message: errorMessage }
	}
  
	// Start building the instruction with the opcode
	instruction |= iValEntry.opcode << instructionFields["opcode"].startsAt
  
	// Confirm that the argument count was what was expected
	if (iValEntry.argCount !== parsedValue.argCount) {
		errorMessage = parsedValue.opcode + " had the wrong argument count: expected " + iValEntry.argCount + ", saw " + parsedValue.argCount
		return { result: false, instruction: 0, brTarget: "", immWasHex: false, message: errorMessage }
	}
  
	let immWasHex = false
	let fieldArgs = iValEntry.args
	for (let i = 0; i < iValEntry.argCount; i++) {
  
		// argType is the argument type for this argument from instructionValidationTable[opcode].args[i]
		let argType = fieldArgs[i]
	
		// iField is the expected argument field
		let iField = instructionFields[argType]
	
		// argSupplied is the text of the argument
		let argSupplied = parsedValue.args[i]
	
		// Use the pattern for this argument type to parse the text value
		var argMatch = argSupplied.match(iField.pattern)
	
		// If the parse fails, it's an error
		if (argMatch === null || argMatch[1] === undefined) {
			errorMessage = parsedValue.opcode + " had incorrect argument " + String(i+1) + ": " + argSupplied
			return{result: false, instruction: 0, brTarget: "", immWasHex: false, message: errorMessage}
		}
	
		// If this field is a branch target, we're done
		if (iField.isLabel) {
			return{result: true, instruction: instruction, immWasHex: false, brTarget: argSupplied, message: ""}
		}
	
		// For anything else, make sure that the value is in range
		if (argMatch[1] < iField.minVal || argMatch[1] > iField.maxVal) {
			errorMessage = parsedValue.opcode + " argument " + String(i+1) + " was out of range: " + argSupplied
			return{result: false, instruction: 0, brTarget: "", immWasHex: false, message: errorMessage}
		}
		// At this point, argMatch[1] is the value of the argument as returned by the RegExp
		// parse. For registers, which look like "r10", argMatch[1] contains 10. For an
		// immediate value, it is the value, which may have a 0x prefix.
	
		var immValue = 0
		// If this is an immediate, we have to separate out the hex and decimal values and
		// parse them differently. If the parse fails, it's an error
		if (iField.isImm) {
			if (argMatch[1].slice(0,2) === "0x") {
				immValue = parseInt(argMatch[1].slice(2), 16)
				immWasHex = true
			} 
			else {
				immValue = parseInt(argMatch[1], 10)
			}
			// Did parseInt return an invalid result?
			if (isNaN(immValue)) {
				errorMessage = parsedValue.opcode + " argument " + String(i+1) + " had an invalid immediate value: " + argSupplied
				return { result: false, instruction: 0, brTarget: "", immWasHex: false, message: errorMessage }
			}
			// Jam the value back into argMatch[i] and let the code below handle combining it
			argMatch[1] = immValue
		}
	
		// Finally, argMatch[i] has the value of the field. Mask it, shift it to the
		// right position in the instruction, and OR it in.
		instruction |= (argMatch[1] & iField.mask) << iField.startsAt
  
	} // end: for (let i = 0; i < iValEntry.argCount; i++)
  
	return { result: true, instruction: instruction, immWasHex: immWasHex, brTarget: "", message: "" }
  
  
	// Loop over the arguments and validate them
  
} // end: function buildInstruction


// ============================================================================
// lineParse
//
// Parse a line into its constituent parts. Assumes that any comments have
// been removed and that blank lines (after comment removal) are skipped
//
// Arguments--
//
// line:      	Line to parse
//
// Returns--
//
//  Hash returning the information. If this value is undefined, there was a parse
//  error on the line. If it isn't undefined, it is a hash with the information.
//  Hash keys are:
//
// label:		Any label that was on the line. If this value is "", there was no
//            	label
//
// opcode:    	The opcode from the line (also includes .loc)
//
// argCount:  	Count of arguments on the line (0..3)
//
// args:      	Array (0..argCount-1) with the argument values
//
function lineParse(line) {
	let label, opcode, match
	// Trim any leading and trailing whitespace
	line.trim()

	// Check for a label
	const labelRegExp = /^(\w+)\:\s*(.+)$/
	label = ""
	match = line.match(labelRegExp)
	if (match !== null) {
		label = match[1]
		line = match[2]
	}

	// Check for .loc
	const locRegExp = /^\.loc\s+(\d+)$/
	match = line.match(locRegExp)
	if (match !== null) {
		opcode = ".loc"
		line = match[1]
	} 
	else {
		// If not .loc, then it must be an opcode with optional args
		const opcodeRegExp = /^(\w+)\s*(.*)$/
		match = line.match(opcodeRegExp)
		if (match !== null) {
				opcode = match[1]
				line = match[2]
		}
		else {
			// If that doesn't match, then something went wrong
			AssemblerMessage("ERROR parsing opcode: " + line)
			return undefined
		}
	}

	// Check for and extract the args
	line = line.replace(/\s+/g, "")
	let argCount = 0
	let argSplit = []
	if (line.length != 0) {
		argSplit = line.split(",")
		argCount = argSplit.length
		if (argCount > 3) {
			AssemblerMessage("ERROR: Too many args on line: " + line)
			return undefined
		}
	}

	// Return the parsed information
	return {
		label: label,
		opcode: opcode,
		argCount: argCount,
		args: argSplit,
	}
} // end: function lineParse