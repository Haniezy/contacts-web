import { Router, rateLimit } from '../http';
import { getDatabase } from '../database/client';
import type { AuthOptions } from '../auth/routes';
import { cloudinaryPhotos, presentContact, type PhotoStore } from './photos';

// A contact's public link: no sign-in, read-only, and only the name,
// number and photo. Birthday, reminder and everything else stay private.
export function shareRouter(
  auth: AuthOptions = {},
  options: { photos?: () => PhotoStore } = {},
) {
  const router = new Router();
  const db = auth.database ?? getDatabase;
  const photos = options.photos ?? cloudinaryPhotos;
  router.get(
    '/:token',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 300,
      message: { error: 'TOO_MANY_REQUESTS' },
    }),
    async (req, res) => {
      res.set('Cache-Control', 'no-store');
      const token = req.params.token as string;
      if (!/^[0-9a-f]{32}$/.test(token)) {
        res.status(404).json({ error: 'NOT_FOUND' });
        return;
      }
      const contact = await db().contact.findUnique({
        where: { shareToken: token },
        select: {
          userId: true,
          name: true,
          phone: true,
          photoKey: true,
          photoUrl: true,
        },
      });
      if (!contact) {
        res.status(404).json({ error: 'NOT_FOUND' });
        return;
      }
      const { userId, ...shown } = contact;
      const { name, phone, photoUrl } = await presentContact(
        shown,
        userId,
        photos,
      );
      res.json({ contact: { name, phone, photoUrl } });
    },
  );
  return router;
}
