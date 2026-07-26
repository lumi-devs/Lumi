{
  description = "Lumi — Production-ready multi-platform dev shell (Bun / Node / Git / GH / JQ / Postgres / Redis / RabbitMQ)";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
  };

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      forEachSystem = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      devShells = forEachSystem (pkgs: {
        default = pkgs.mkShell {
          packages = with pkgs; [
            bun
            nodejs
            git
            gh
            jq
            coreutils
            turbo
            openssl
            prisma-engines
            postgresql
            redis
            rabbitmq-server
          ];

          env = {
            PRISMA_QUERY_ENGINE_LIBRARY = "${pkgs.prisma-engines}/lib/libquery_engine.node";
            PRISMA_SCHEMA_ENGINE_BINARY = "${pkgs.prisma-engines}/bin/schema-engine";
          };

          shellHook = ''
            echo "========================================="
            echo "  Lumi Multi-Platform Dev Shell (Flake)  "
            echo "========================================="
            echo "  Bun:        $(bun --version 2>/dev/null || echo 'N/A')"
            echo "  Node:       $(node --version 2>/dev/null || echo 'N/A')"
            echo "  Git:        $(git --version 2>/dev/null || echo 'N/A')"
            echo "  GitHub CLI: $(gh --version 2>/dev/null | head -n1 || echo 'N/A')"
            echo "  jq:         $(jq --version 2>/dev/null || echo 'N/A')"
            echo "  Turbo:      $(turbo --version 2>/dev/null || echo 'N/A')"
            echo "========================================="
          '';
        };
      });

      formatter = forEachSystem (pkgs: pkgs.nixpkgs-fmt);
    };
}
