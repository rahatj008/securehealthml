import path from "node:path";
import { createRequire } from "node:module";

const frontendPackageJsonPath = path.join(process.cwd(), "package.json");
const backendPackageJsonPath = path.join(process.cwd(), "..", "Backend", "package.json");
const frontendRequire = createRequire(frontendPackageJsonPath);
const backendRequire = createRequire(backendPackageJsonPath);

function loadDependency(name) {
  try {
    return frontendRequire(name);
  } catch {
    return backendRequire(name);
  }
}

export const AWS = loadDependency("aws-sdk");
export const bcrypt = loadDependency("bcryptjs");
export const jwt = loadDependency("jsonwebtoken");
export const pg = loadDependency("pg");
export const { v4: uuidv4 } = loadDependency("uuid");
