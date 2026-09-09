-- PawTrack sample data. Run AFTER schema.sql.
-- Safe to re-run: uses fixed UUIDs and ON CONFLICT DO NOTHING.

-- Reset OSO sequence after demo dogs
select setval('public.dogs_oso_seq', 21, true);

insert into public.dogs (
  id, oso_id, name, sex, age, breed, color, size, status,
  vax_5in1, anti_rabies, dewormed, spayed, temperament, story, intake_at, died_at, mother_id
) values
  ('11111111-1111-1111-1111-111111111001', 'OSO-2026-001', 'Luna', 'Female', 'Young Adult', 'Aspin', 'Cream', 'Medium', 'Available', true, true, true, true, 'Gentle, people-friendly', 'Luna was a shy street pup. She now loves quiet homes and evening walks.', now() - interval '12 days', null, null),
  ('11111111-1111-1111-1111-111111111002', 'OSO-2026-002', 'Oreo', 'Male', 'Adult', 'Aspin mix', 'Black & white', 'Medium', 'Available', true, true, true, true, 'Playful, loyal', 'Oreo came to us healthy and happy after a clinic day. He is great with other dogs.', now() - interval '8 days', null, null),
  ('11111111-1111-1111-1111-111111111003', 'OSO-2026-003', 'Bantay', 'Male', 'Adult', 'Aspin', 'Brown', 'Large', 'Adopted', true, true, true, true, 'Calm watchdog', 'Bantay waited at the City Dog Pound for months.', now() - interval '90 days', null, null),
  ('11111111-1111-1111-1111-111111111004', 'OSO-2026-004', 'Mocha', 'Female', 'Puppy', 'Aspin', 'Tan', 'Small', 'Fostered', true, true, true, false, 'Curious, snuggly', 'Mocha is a young foster who still needs training and lots of playtime.', now() - interval '6 days', null, null),
  ('11111111-1111-1111-1111-111111111005', 'OSO-2026-005', 'King', 'Male', 'Senior', 'Aspin', 'Brindle', 'Large', 'Available', true, true, true, true, 'Laid-back', 'King is a senior gentleman who prefers naps, short walks, and a couch of his own.', now() - interval '20 days', null, null),
  ('11111111-1111-1111-1111-111111111006', 'OSO-2026-006', 'Nala', 'Female', 'Young Adult', 'Aspin', 'Golden', 'Medium', 'Available', true, true, true, true, 'Bright, affectionate', 'Nala thrives with daily walks and a household that will keep her mind busy.', now() - interval '4 days', null, null),
  ('11111111-1111-1111-1111-111111111007', 'OSO-2026-007', 'Mark', 'Male', 'Senior', 'Aspin', 'Brown', 'Large', 'Available', true, true, true, true, 'Loyal, alert', 'Mark is a sturdy senior looking for a quiet home and a consistent walker.', now() - interval '15 days', null, null),
  ('11111111-1111-1111-1111-111111111008', 'OSO-2026-008', 'Coco', 'Female', 'Adult', 'Aspin', 'Black', 'Medium', 'Pending Adoption', true, true, true, true, 'Sweet', 'Coco is reserved pending a home visit.', now() - interval '18 days', null, null),
  ('11111111-1111-1111-1111-111111111009', 'OSO-2026-009', 'Chip', 'Male', 'Puppy', 'Aspin mix', 'White', 'Small', 'Under Treatment', false, false, true, false, 'Shy', 'Chip is recovering from a clinic stay.', now() - interval '3 days', null, null),
  ('11111111-1111-1111-1111-111111111010', 'OSO-2026-010', 'Maya', 'Female', 'Young Adult', 'Aspin', 'Tan', 'Medium', 'Fostered', true, true, true, true, 'Gentle', 'Maya is in a temporary foster home.', now() - interval '40 days', null, null),
  ('11111111-1111-1111-1111-111111111011', 'OSO-2026-011', 'Bolt', 'Male', 'Adult', 'Aspin', 'Cream', 'Medium', 'Adopted', true, true, true, true, 'Playful', 'Bolt found his family this month.', now() - interval '50 days', null, null),
  ('11111111-1111-1111-1111-111111111012', 'OSO-2026-012', 'Sari', 'Female', 'Puppy', 'Aspin', 'Brown', 'Small', 'Adopted', true, true, true, false, 'Bouncy', 'Sari was adopted after two weeks in care.', now() - interval '22 days', null, null),
  ('11111111-1111-1111-1111-111111111013', 'OSO-2026-013', 'Daisy', 'Female', 'Puppy', 'Aspin', 'White', 'Small', 'Available', true, true, true, false, 'Playful, cuddly', 'Daisy is a bright pup who loves toys, naps, and being near people.', now() - interval '5 days', null, '11111111-1111-1111-1111-111111111001'),
  ('11111111-1111-1111-1111-111111111014', 'OSO-2026-014', 'Rocky', 'Male', 'Adult', 'Aspin mix', 'Gray', 'Large', 'Available', true, true, true, true, 'Steady, friendly', 'Rocky is a solid companion for an active home with room to roam.', now() - interval '11 days', null, null),
  ('11111111-1111-1111-1111-111111111015', 'OSO-2026-015', 'Pepper', 'Female', 'Young Adult', 'Aspin mix', 'Tri-color', 'Medium', 'Available', true, true, true, true, 'Curious, smart', 'Pepper watches everything. She will thrive with walks and simple training.', now() - interval '9 days', null, null),
  ('11111111-1111-1111-1111-111111111016', 'OSO-2026-016', 'Bruno', 'Male', 'Senior', 'Aspin', 'Black', 'Large', 'Available', true, true, true, true, 'Gentle giant', 'Bruno is a calm senior who wants a quiet porch and a patient family.', now() - interval '28 days', null, null),
  ('11111111-1111-1111-1111-111111111017', 'OSO-2026-017', 'Misty', 'Female', 'Adult', 'Aspin', 'Silver', 'Medium', 'Available', true, true, true, true, 'Soft, loyal', 'Misty warms up quickly and follows her person from room to room.', now() - interval '7 days', null, null),
  ('11111111-1111-1111-1111-111111111018', 'OSO-2026-018', 'Shadow', 'Male', 'Young Adult', 'Aspin mix', 'Dark brown', 'Medium', 'Available', true, true, true, true, 'Alert, affectionate', 'Shadow is a little shy at first, then a devoted shadow once he trusts you.', now() - interval '14 days', null, null),
  ('11111111-1111-1111-1111-111111111019', 'OSO-2026-019', 'Ginger', 'Female', 'Puppy', 'Aspin mix', 'Red', 'Small', 'Available', true, true, true, false, 'Bouncy, social', 'Ginger brings energy to every room and does well with older kids.', now() - interval '2 days', null, '11111111-1111-1111-1111-111111111006'),
  ('11111111-1111-1111-1111-111111111020', 'OSO-2026-020', 'Scout', 'Male', 'Adult', 'Aspin', 'Tan', 'Medium', 'Available', true, true, true, true, 'Brave, friendly', 'Scout is a trail buddy looking for weekend walks and a spot on the couch.', now() - interval '16 days', null, null),
  ('11111111-1111-1111-1111-111111111021', 'OSO-2026-021', 'Rusty', 'Male', 'Senior', 'Aspin', 'Rust', 'Large', 'Deceased', true, true, true, true, 'Gentle', 'Rusty came in as a senior and was loved by the staff.', now() - interval '70 days', now() - interval '2 days', null)
on conflict (id) do nothing;

insert into public.donations (name, amount, purpose, method, created_at) values
  ('Mariel Cruz', 2500, 'Veterinary Care', 'GCash', now() - interval '200 minutes'),
  ('Ella B.', 1000, 'Dog Food & Supplies', 'GCash', now() - interval '400 minutes'),
  ('Ana Rivas', 5000, 'General Fund', 'Bank Transfer', now() - interval '800 minutes'),
  ('Josh Lim', 500, 'Care for Luna', 'GCash', now() - interval '50 minutes');

-- Donation trigger also writes inbox + activity. Extra contact messages:
insert into public.inbox_messages (name, email, subject, body, kind, read, created_at) values
  ('Carlo', 'carlo@email.com', 'Volunteer inquiry', 'Can I join Saturday clinic day?', 'contact', false, now() - interval '140 minutes'),
  ('Ella', 'ella@email.com', 'Thank you', 'Oreo is settling in well.', 'contact', true, now() - interval '900 minutes');
