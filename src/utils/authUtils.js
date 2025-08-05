// src/utils/authUtils.js
import permissions from "./permissions";

export function hasPermission(role, permission) {
  return permissions[role]?.includes(permission);
}
