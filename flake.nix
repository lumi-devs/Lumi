{
  description = "Lumi — dev shell (Bun / TypeScript / Prisma / Postgres / Redis / RabbitMQ)";

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
            nodejs_22
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
            echo "Lumi dev shell - bun $(bun --version), node $(node --version), turbo $(turbo --version)"
          '';
        };
      });

      formatter = forEachSystem (pkgs: pkgs.nixpkgs-fmt);
    };
}
