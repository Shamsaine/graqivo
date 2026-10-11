import 'dotenv/config';
import { StorageService } from './storage.service.js';
const storage = new StorageService();
storage
  .provision()
  .then(() => console.log('Private storage bucket provisioned.'))
  .catch(() => {
    console.error(
      'Storage provisioning failed. Check storage credentials and service.',
    );
    process.exitCode = 1;
  })
  .finally(() => storage.client.destroy());
