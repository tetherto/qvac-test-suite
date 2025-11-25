#!/usr/bin/env bun
/**
 * Cross-platform script to set ALLOW_WILDCARD_CONSUMERS=true in .env file
 * Creates .env if it doesn't exist, updates variable if it exists, or adds it if missing
 */

import * as fs from "fs";
import * as path from "path";

const ENV_FILE = path.join(__dirname, "..", ".env");
const VARIABLE_NAME = "ALLOW_WILDCARD_CONSUMERS";
const VARIABLE_VALUE = "true";

function setLocalEnv() {
	let envContent = "";
	let variableExists = false;
	let needsUpdate = false;

	// Read existing .env file if it exists
	if (fs.existsSync(ENV_FILE)) {
		envContent = fs.readFileSync(ENV_FILE, "utf-8");
		const lines = envContent.split(/\r?\n/);
		
		// Check if variable exists and update if needed
		const updatedLines = lines.map((line) => {
			const trimmed = line.trim();
			// Match variable with optional whitespace and = sign
			if (trimmed.startsWith(`${VARIABLE_NAME}=`)) {
				variableExists = true;
				const currentValue = trimmed.split("=")[1]?.trim();
				if (currentValue !== VARIABLE_VALUE) {
					needsUpdate = true;
					return `${VARIABLE_NAME}=${VARIABLE_VALUE}`;
				}
				return line; // Already correct, keep as-is
			}
			return line;
		});
		
		envContent = updatedLines.join("\n");
	}

	// Add variable if it doesn't exist
	if (!variableExists) {
		// Add newline if file exists and doesn't end with one
		if (fs.existsSync(ENV_FILE) && !envContent.endsWith("\n") && envContent.length > 0) {
			envContent += "\n";
		}
		envContent += `${VARIABLE_NAME}=${VARIABLE_VALUE}\n`;
		needsUpdate = true;
	}

	// Write to file if changes were made
	if (needsUpdate || !fs.existsSync(ENV_FILE)) {
		fs.writeFileSync(ENV_FILE, envContent, "utf-8");
		console.log(`✅ Set ${VARIABLE_NAME}=${VARIABLE_VALUE} in ${ENV_FILE}`);
		if (variableExists) {
			console.log(`   (Updated existing value)`);
		} else {
			console.log(`   (Added new variable)`);
		}
	} else {
		console.log(`✅ ${VARIABLE_NAME} is already set to ${VARIABLE_VALUE} in ${ENV_FILE}`);
	}
}

try {
	setLocalEnv();
} catch (error) {
	console.error(`❌ Error setting local environment: ${error}`);
	process.exit(1);
}

