#!/usr/bin/env bash
# Convert all FBX in public/assets/models/ to optimized GLB.
# Pipeline: FBX2glTF -b → @gltf-transform/cli optimize (Draco/Meshopt + WebP textures).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/public/assets/models"
OUT="$ROOT/public/assets/models-glb"
TMP="$ROOT/.fbx2gltf-tmp"
FBX2GLTF="/opt/homebrew/lib/node_modules/fbx2gltf/bin/Darwin/FBX2glTF"

mkdir -p "$OUT" "$TMP"

count=0
for fbx in "$SRC"/*.fbx; do
  name="$(basename "$fbx" .fbx)"
  raw="$TMP/$name.glb"
  final="$OUT/$name.glb"
  if [[ -f "$final" ]]; then
    echo "skip $name (exists)"
    continue
  fi
  echo "[$((++count))] $name"
  "$FBX2GLTF" -b -i "$fbx" -o "$TMP/$name" >/dev/null 2>&1 || { echo "  fbx2gltf failed"; continue; }
  npx -y @gltf-transform/cli optimize "$raw" "$final" --texture-compress webp >/dev/null 2>&1 || { echo "  optimize failed, copying raw"; cp "$raw" "$final"; }
  rm -f "$raw"
done

rm -rf "$TMP"
echo "done. output:"
du -sh "$OUT"
