-- Run AFTER you create these users in Authentication → Users.

update public.profiles
  set role = 'admin', status = 'active'
  where email = 'admin@pawtrack.app';

update public.profiles
  set role = 'staff', status = 'active'
  where email = 'staff@pawtrack.app';
