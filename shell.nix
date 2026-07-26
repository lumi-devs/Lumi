{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  packages = with pkgs; [
    bun
    nodejs
    git
    gh
    jq
    coreutils
  ];

  shellHook = ''
    echo "========================================="
    echo "  Lumi Development Shell (Nix)           "
    echo "========================================="
    echo "  Bun:        $(bun --version 2>/dev/null || echo 'N/A')"
    echo "  Node:       $(node --version 2>/dev/null || echo 'N/A')"
    echo "  Git:        $(git --version 2>/dev/null || echo 'N/A')"
    echo "  GitHub CLI: $(gh --version 2>/dev/null | head -n1 || echo 'N/A')"
    echo "  jq:         $(jq --version 2>/dev/null || echo 'N/A')"
    echo "========================================="
  '';
}
