import { Store } from "@sapphire/framework";
import { Service } from "./Service.js";

export class ServiceStore extends Store<Service> {
  public constructor() {
    super(Service, { name: "services" });
  }
}
