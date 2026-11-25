export type UserRole = 'staff' | 'admin' | 'volunteer'
export type AccountStatus = 'active' | 'pending' | 'suspended'
export type DogSex = 'Female' | 'Male'
export type DogAge = 'Puppy' | 'Young Adult' | 'Adult' | 'Senior'
export type DogSize = 'Small' | 'Medium' | 'Large'
export type DogStatus =
  | 'Available'
  | 'Under Treatment'
  | 'Pending Adoption'
  | 'Fostered'
  | 'Adopted'
  | 'Deceased'
export type AdoptionStatus = 'pending' | 'approved' | 'rejected'
export type DonationStatus = 'pending' | 'confirmed' | 'rejected'
export type DonationMethod = 'GCash' | 'GoTyme' | 'Bank Transfer' | 'Cash / Walk-in' | 'In-kind Donation'
export type MessageKind = 'contact' | 'adoption' | 'donation' | 'staff'

export type Profile = {
  id: string
  username: string
  display_name: string
  email: string | null
  role: UserRole
  status: AccountStatus
  created_at: string
}

export type Dog = {
  id: string
  oso_id: string
  name: string
  sex: DogSex
  age: DogAge
  breed: string
  color: string
  size: DogSize
  status: DogStatus
  vax_5in1: boolean
  anti_rabies: boolean
  dewormed: boolean
  spayed: boolean
  temperament: string
  story: string
  photo_url: string
  visible: boolean
  mother_id: string | null
  intake_at: string
  died_at: string | null
}

export const INTAKE_REASONS = ['Under treatment', 'Injured', 'Sick', 'Quarantine', 'Too young', 'Behavior assessment', 'Other'] as const
export type IntakeReason = (typeof INTAKE_REASONS)[number]

/** A dog that just arrived and can't be adopted yet (staff only). */
export type Intake = {
  id: string
  name: string
  sex: DogSex
  age: DogAge
  breed: string
  color: string
  size: DogSize
  photo_url: string
  reason: IntakeReason
  found_at: string
  rescued_by: string
  notes: string
  temperament: string
  vax_5in1: boolean
  anti_rabies: boolean
  dewormed: boolean
  spayed: boolean
  intake_at: string
  moved_at: string | null
  moved_to: 'Available' | 'Deceased' | null
  moved_dog_id: string | null
}

export type Adoption = {
  id: string
  dog_id: string
  applicant: string
  email: string
  phone: string
  address: string
  home: string
  pets: string
  note: string
  id_photo_url: string
  status: AdoptionStatus
  created_at: string
}

export type Donation = {
  id: string
  name: string
  email: string
  amount: number
  purpose: string
  method: DonationMethod
  message: string
  dog_id: string | null
  status: DonationStatus
  reference_no: string
  receipt_path: string
  anonymous: boolean
  decided_at: string | null
  created_at: string
}

export type InboxMessage = {
  id: string
  name: string
  email: string
  subject: string
  body: string
  kind: MessageKind
  dog_id: string | null
  read: boolean
  created_at: string
}

export type Activity = {
  id: string
  text: string
  created_at: string
}

export const CARE_STATUSES: DogStatus[] = ['Available', 'Under Treatment', 'Pending Adoption', 'Fostered']
export const ADD_STATUSES: DogStatus[] = ['Available', 'Under Treatment']
export const AGES: DogAge[] = ['Puppy', 'Young Adult', 'Adult', 'Senior']
export const SEXES: DogSex[] = ['Female', 'Male']
export const SIZES: DogSize[] = ['Small', 'Medium', 'Large']
