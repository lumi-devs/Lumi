import { Store } from "@sapphire/framework";
import { Service } from "./Service.js";

/**
 * A specialized Sapphire {@link Store} for managing singleton {@link Service} pieces within modules.
 */
export class ServiceStore extends Store<Service> {
  /**
   * Constructs a new ServiceStore instance.
   */
  public constructor() {
    super(Service, { name: "services" });
  }
}
