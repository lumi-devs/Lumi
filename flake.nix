{
  description = "Lumi v2 — Bun monorepo dev shell";

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
            openssl
            util-linux
            postgresql
            redis
            prisma-engines
            stdenv.cc.cc.lib
          ];

          env = {
            PRISMA_QUERY_ENGINE_LIBRARY = "${pkgs.prisma-engines}/lib/libquery_engine.node";
            PRISMA_SCHEMA_ENGINE_BINARY = "${pkgs.prisma-engines}/bin/schema-engine";
          };

          shellHook = ''
            export LD_LIBRARY_PATH="${pkgs.stdenv.cc.cc.lib}/lib:${pkgs.util-linux.lib}/lib:$LD_LIBRARY_PATH"
            echo "lumi v2 · bun $(bun --version) · node $(node --version) · pg $(postgres --version | cut -d' ' -f3) · redis $(redis-server --version | cut -d' ' -f3 | cut -d= -f2)"
          '';
        };
      });

      formatter = forEachSystem (pkgs: pkgs.nixpkgs-fmt);
    };
}
