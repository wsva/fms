'use client';

import { setDatasetInfo } from '@/app/actions/dataset_hub';
import type { DatasetPatch } from './DatasetEditForm';

/**
 * The lane between the card's form and the server action.
 *
 * `DatasetEditForm` keeps the back face open by *throwing* — that is how the
 * app's `invoke` rejects, and the form is a verbatim port of it. This site's
 * server actions answer with `ActionResult` instead, so a refusal arrives as a
 * value. Turning it back into a throw here means every page's pencil shows the
 * refusal inline on the card rather than silently flipping back as if it saved.
 */
export async function saveDatasetInfo(uuid: string, patch: DatasetPatch): Promise<void> {
    const result = await setDatasetInfo(uuid, patch);
    if (result.status === 'error') {
        throw new Error(typeof result.error === 'string' ? result.error : 'Could not save this dataset');
    }
}
