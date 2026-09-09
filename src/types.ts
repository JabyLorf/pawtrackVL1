export type UserRole = 'client' | 'staff' | 'admin' | 'volunteer'
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
export type DonationMethod = 'GCash' | 'Bank Transfer' | 'Cash / Walk-in' | 'In-kind Donation'
export type MessageKind = 'contact' | 'adoption' | 'donation'

export type MediaType = 'photo' | 'video'
export type ReportStatus = 'pending' | 'resolved' | 'dismissed'

export type Profile = {
  id: string
  username: string
  display_name: string
  email: string | null
  role: UserRole
  status: AccountStatus
  bio: string
  avatar_url: string
  avatar_hue: number
  private_account: boolean
  followers_count?: number
  following_count?: number
  likes_total?: number
}

export type Post = {
  id: string
  user_id: string
  media_url: string
  media_type: MediaType
  caption: string
  likes_count: number
  comments_count: number
  reposts_count: number
  hidden: boolean
  created_at: string
}

export type PostComment = {
  id: string
  post_id: string
  user_id: string
  parent_id: string | null
  text: string
  hidden: boolean
  created_at: string
}

export type PostLike = {
  id: string
  post_id: string
  user_id: string
}

export type Follow = {
  id: string
  follower_id: string
  following_id: string
}

export type Notification = {
  id: string
  to_user_id: string
  from_user_id: string | null
  text: string
  type: string
  post_id: string | null
  dog_id: string | null
  read: boolean
  created_at: string
}

export type ChatMessage = {
  id: string
  thread: string
  from_id: string
  text: string
  created_at: string
}

export type Repost = {
  id: string
  post_id: string
  user_id: string
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
  owner_id: string | null
  mother_id: string | null
  intake_at: string
  died_at: string | null
}

export type Adoption = {
  id: string
  dog_id: string
  user_id: string | null
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
