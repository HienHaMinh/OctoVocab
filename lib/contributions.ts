import { createAdminClient } from '@/lib/supabase/server'
import type { ContributionItem } from '@/types'

/**
 * Execute approved contribution items against the words table.
 * Called when editor approves a contribution.
 * Uses admin client to bypass RLS.
 */
export async function executeApprovedItems(
  contributionId: string,
  sourceId: string | null,
  items: ContributionItem[],
  contributorId: string
): Promise<{ inserted: number; updated: number; errors: string[] }> {
  const adminClient = await createAdminClient()
  let inserted = 0
  let updated = 0
  const errors: string[] = []

  for (const item of items) {
    if (item.status !== 'approved' || !item.selected) continue

    try {
      switch (item.change_type) {
        case 'add_word': {
          // Insert new word
          const { data: word, error: insertErr } = await adminClient
            .from('words')
            .upsert({
              word: item.word.toLowerCase(),
              cefr_level: item.proposed_cefr || 'Unclassified',
              cefr_confidence: 0.8,
              status: 'active',
              first_seen_at: new Date().toISOString(),
            }, { onConflict: 'word', ignoreDuplicates: true })
            .select('id')
            .single()

          if (insertErr) {
            // Word might already exist (race condition) — fetch it
            const { data: existing } = await adminClient
              .from('words')
              .select('id')
              .eq('word', item.word.toLowerCase())
              .single()
            if (existing && sourceId) {
              await adminClient.from('word_source_frequency').upsert({
                word_id: existing.id,
                source_id: sourceId,
                frequency: item.proposed_frequency || 1,
              }, { onConflict: 'word_id,source_id' })
            }
            // Still add translation if proposed
            if (item.proposed_translation && existing) {
              await adminClient.from('word_translations').upsert({
                word_id: existing.id,
                teacher_id: contributorId,
                vi_translation: item.proposed_translation,
                confidence: 0.8,
              }, { onConflict: 'word_id,teacher_id' })
            }
            // Add image if proposed
            if (item.proposed_image_url && existing) {
              await adminClient.from('word_images').insert({
                word_id: existing.id,
                image_url: item.proposed_image_url,
                image_source: 'contribution',
                added_by: contributorId,
              })
            }
          } else if (word && sourceId) {
            await adminClient.from('word_source_frequency').upsert({
              word_id: word.id,
              source_id: sourceId,
              frequency: item.proposed_frequency || 1,
            }, { onConflict: 'word_id,source_id' })
            inserted++

            // Add translation if proposed
            if (item.proposed_translation) {
              await adminClient.from('word_translations').upsert({
                word_id: word.id,
                teacher_id: contributorId,
                vi_translation: item.proposed_translation,
                confidence: 0.8,
              }, { onConflict: 'word_id,teacher_id' })
            }

            // Add example sentence if extracted
            if (item.example_sentence) {
              await adminClient.from('word_examples').insert({
                word_id: word.id,
                example_sentence: item.example_sentence,
                source_id: sourceId,
                source_url: item.example_source_url,
                source_name: item.example_source_name,
                added_by: contributorId,
                auto_extracted: true,
              })
            }

            // Add image if proposed during contribution
            if (item.proposed_image_url) {
              await adminClient.from('word_images').insert({
                word_id: word.id,
                image_url: item.proposed_image_url,
                image_source: 'contribution',
                added_by: contributorId,
              })
            }
          }
          break
        }

        case 'update_frequency': {
          if (!item.word_id || !sourceId) break
          await adminClient.from('word_source_frequency').upsert({
            word_id: item.word_id,
            source_id: sourceId,
            frequency: item.proposed_frequency || 1,
          }, { onConflict: 'word_id,source_id' })
          updated++
          break
        }

        case 'cefr_conflict': {
          if (!item.word_id) break
          await adminClient.from('words').update({
            cefr_level: item.proposed_cefr,
            cefr_assigned_at: new Date().toISOString(),
          }).eq('id', item.word_id)

          // Also update frequency if source provided
          if (sourceId) {
            await adminClient.from('word_source_frequency').upsert({
              word_id: item.word_id,
              source_id: sourceId,
              frequency: item.proposed_frequency || 1,
            }, { onConflict: 'word_id,source_id' })
          }
          updated++
          break
        }

        case 'add_translation': {
          if (!item.word_id || !item.proposed_translation) break
          await adminClient.from('word_translations').upsert({
            word_id: item.word_id,
            teacher_id: contributorId,
            vi_translation: item.proposed_translation,
            confidence: 0.8,
          }, { onConflict: 'word_id,teacher_id' })
          updated++
          break
        }
      }
    } catch (err) {
      errors.push(`Failed to process item ${item.id}: ${err}`)
    }
  }

  return { inserted, updated, errors }
}
